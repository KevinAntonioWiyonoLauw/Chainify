package httpapi

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/chainify/backend/internal/config"
	"github.com/chainify/backend/internal/identity"
	"github.com/chainify/backend/internal/listing"
	"github.com/chainify/backend/internal/pod"
)

// Server wires dependencies into an http.Handler.
type Server struct {
	cfg         config.Config
	logger      *slog.Logger
	resolver    *identity.Resolver
	prober      *pod.Prober
	probeClient *http.Client
	listings    *listing.Reader
	started     time.Time
}

// New builds a Server from its dependencies.
func New(cfg config.Config, logger *slog.Logger, resolver *identity.Resolver, prober *pod.Prober) *Server {
	server := &Server{
		cfg:         cfg,
		logger:      logger,
		resolver:    resolver,
		prober:      prober,
		probeClient: &http.Client{Timeout: 2 * time.Second},
		started:     time.Now().UTC(),
	}
	// Discovery reuses the guard and transport already built for identity resolution so a
	// second outbound path cannot bypass the SSRF policy or the TLS trust settings.
	if resolver != nil && resolver.Guard() != nil {
		server.listings = listing.NewReader(
			resolver.Guard(),
			resolver.Guard().NewTransport(cfg.FetchTimeout),
			cfg.MaxProfileBytes,
			cfg.FetchTimeout,
		)
	}
	return server
}

// SetListingReader overrides the reader, used by tests that need a fixed transport.
func (s *Server) SetListingReader(reader *listing.Reader) {
	s.listings = reader
}

// UseProviderTransport makes /readyz probe the configured issuer through the same
// transport as identity resolution. Callers that want provider reachability to reflect
// the node's real TLS trust (a local dev provider uses a self-signed certificate) pass
// the resolver's transport here; without it the probe uses the default one.
func (s *Server) UseProviderTransport(roundTripper http.RoundTripper) {
	s.probeClient = &http.Client{Timeout: 2 * time.Second, Transport: roundTripper}
}

// Handler returns the fully wrapped routes for this service.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /readyz", s.handleReady)
	mux.HandleFunc("GET /api/meta", s.handleMeta)
	mux.HandleFunc("GET /api/identity/resolve", s.handleResolve)
	mux.HandleFunc("POST /api/identity/resolve", s.handleResolve)
	mux.HandleFunc("GET /api/pod/probe", s.handleProbe)
	mux.HandleFunc("POST /api/discovery/query", s.handleDiscovery)
	mux.HandleFunc("GET /api/listing/verify", s.handleVerify)
	mux.HandleFunc("POST /api/listing/verify", s.handleVerify)
	mux.HandleFunc("GET /api/listing/document", s.handleDocument)
	mux.HandleFunc("/", s.handleNotFound)

	return WithMiddleware(s.logger, s.cfg.AllowedOrigins, 64<<10, mux)
}

// buildInfo is replaced at link time by the release build; the dev build keeps defaults.
var (
	buildVersion = "0.1.0"
	buildCommit  = "dev"
)

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"service":       "chainify-api",
		"version":       buildVersion,
		"commit":        buildCommit,
		"uptimeSeconds": int64(time.Since(s.started).Seconds()),
		"time":          time.Now().UTC(),
	})
}

// handleReady reports whether the service can serve traffic, including whether the
// configured Solid provider answers on the network.
//
// Provider reachability is reported as metadata, not as readiness failure: the API can
// still serve identity resolution for other issuers while the local CSS is restarting.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	probeCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	provider := s.probeProvider(probeCtx)
	payload := map[string]any{
		"status":   "ready",
		"provider": provider,
		"time":     time.Now().UTC(),
	}
	writeJSON(w, http.StatusOK, payload)
}

// probeProvider asks the configured issuer whether it answers, and says why when it does
// not. "unreachable" alone is the worst possible answer here: a wrong scheme, a rejected
// certificate, and a stopped container all look identical, and the operator has to guess
// which one to fix.
func (s *Server) probeProvider(ctx context.Context) map[string]any {
	out := map[string]any{"issuer": s.cfg.CSSIssuerURL, "reachable": false}
	target, err := s.resolveProviderHost(s.cfg.CSSIssuerURL)
	if err != nil {
		out["reason"] = err.Error()
		return out
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		out["reason"] = "bad_issuer_url"
		return out
	}
	req.Header.Set("Accept", "text/turtle, */*")

	// The probe shares the resolver's transport so both honour the same TLS trust
	// settings. A bare http.Client falls back to the system root store, which does not
	// trust the local dev provider's self-signed certificate, and reported a healthy
	// issuer as "unreachable" while identity resolution worked.
	client := s.probeClient
	resp, err := client.Do(req)
	if err != nil {
		out["reason"] = "unreachable"
		out["detail"] = probeFailureDetail(err)
		return out
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<10))
		_ = resp.Body.Close()
	}()

	out["reachable"] = resp.StatusCode < 500
	out["statusCode"] = resp.StatusCode
	return out
}

// probeFailureDetail turns a transport error into the one line an operator can act on.
func probeFailureDetail(err error) string {
	var unknownAuthority x509.UnknownAuthorityError
	if errors.As(err, &unknownAuthority) {
		return "tls_untrusted_certificate"
	}
	var recordHeader tls.RecordHeaderError
	if errors.As(err, &recordHeader) {
		return "tls_handshake_rejected: the issuer answered plaintext, so the scheme is probably wrong"
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) && urlErr.Err != nil {
		return urlErr.Err.Error()
	}
	return err.Error()
}

// resolveProviderHost normalises the issuer URL so a missing path does not produce a
// rootless request.
func (s *Server) resolveProviderHost(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", errors.New("bad_issuer_url")
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("bad_issuer_url")
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	return parsed.String(), nil
}

func (s *Server) handleMeta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service":            "chainify-api",
		"phase":              2,
		"issuer":             s.cfg.CSSIssuerURL,
		"allowedOrigins":     s.cfg.AllowedOrigins,
		"fetchAllowlist":     s.cfg.FetchAllowlist,
		"fetchTimeoutMs":     s.cfg.FetchTimeout.Milliseconds(),
		"maxProfileBytes":    s.cfg.MaxProfileBytes,
		"maxParticipants":    listing.MaxParticipants,
		"authoritativeStore": "solid-pod",
		"notes": []string{
			"This service stores no Pod data and no business catalog.",
			"Pod read/write happens in the browser using the user's Solid-OIDC session.",
			"Discovery reads peers' public indexes live and caches nothing.",
			"Verification is structural; it does not prove any business claim is true.",
			"Server-side DPoP validation is not implemented in this phase.",
		},
	})
}

// handleResolve turns a WebID into its Pod location and issuer.
//
// Input comes from a query parameter, so the SSRF guard runs before any network call.
func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeError(w, r, s.logger, http.StatusBadRequest, "bad_request",
			"The request could not be parsed.", "")
		return
	}

	raw := firstNonEmpty(r.URL.Query().Get("webid"), r.URL.Query().Get("webId"))
	if raw == "" {
		writeError(w, r, s.logger, http.StatusBadRequest, "missing_webid",
			"Provide a WebID via the 'webid' query parameter.", "")
		return
	}

	profile, err := s.resolver.Resolve(r.Context(), raw)
	if err != nil {
		s.writeResolveError(w, r, err)
		return
	}

	if len(profile.Storage) == 0 {
		writeError(w, r, s.logger, http.StatusUnprocessableEntity, "no_storage_declared",
			"This WebID does not declare pim:storage, so no Pod location can be resolved.",
			profile.WebID)
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) writeResolveError(w http.ResponseWriter, r *http.Request, err error) {
	var resolveErr *identity.ResolveError
	if !errors.As(err, &resolveErr) {
		writeError(w, r, s.logger, http.StatusInternalServerError, "resolve_failed",
			"Identity resolution failed.", "")
		return
	}

	status := statusForReason(resolveErr.Reason)
	if status >= 500 {
		s.logger.Warn("resolution upstream failure",
			slog.String("reason", resolveErr.Reason),
			slog.String("path", r.URL.Path),
		)
	}
	writeJSON(w, status, errorBody{
		Error:   resolveErr.Reason,
		Message: resolutionMessage(resolveErr.Reason),
	})
}

func resolutionMessage(reason string) string {
	switch reason {
	case "ssrf_blocked":
		return "That WebID host is not on this node's fetch allowlist."
	case "webid_not_found":
		return "No profile was found at that WebID."
	case "webid_forbidden":
		return "The profile is not readable anonymously. A WebID document must be public."
	case "webid_requires_auth":
		return "The WebID document requires authentication and cannot be resolved server-side."
	case "pod_unreachable":
		return "The Pod provider could not be reached."
	case "rate_limited":
		return "The Pod provider is rate limiting this node. Try again shortly."
	case "parse_failed":
		return "The WebID profile could not be parsed as RDF."
	case "profile_too_large":
		return "The WebID profile exceeded the configured size limit."
	default:
		return "Identity resolution failed."
	}
}

// handleProbe reports whether a Pod root answers, without retaining any of its contents.
func (s *Server) handleProbe(w http.ResponseWriter, r *http.Request) {
	raw := firstNonEmpty(r.URL.Query().Get("storage"), r.URL.Query().Get("pod"))
	if raw == "" {
		writeError(w, r, s.logger, http.StatusBadRequest, "missing_storage",
			"Provide a Pod storage URL via the 'storage' query parameter.", "")
		return
	}

	probe, err := s.prober.Check(r.Context(), raw)
	if err != nil {
		// Prober.Check returns the guard's errors directly, not wrapped in ResolveError,
		// so inspect the sentinel errors themselves. A blocked host is the caller's
		// problem (400), never an upstream failure (502).
		var resolveErr *identity.ResolveError
		switch {
		case errors.Is(err, identity.ErrBlockedScheme),
			errors.Is(err, identity.ErrBlockedCredentials),
			errors.Is(err, identity.ErrBlockedHost),
			errors.Is(err, identity.ErrBlockedPort):
			writeError(w, r, s.logger, http.StatusBadRequest, "ssrf_blocked",
				"That storage URL is not allowed by this node's fetch policy.", "")
			return
		case errors.Is(err, identity.ErrBlockedAddress):
			writeError(w, r, s.logger, http.StatusBadRequest, "ssrf_blocked",
				"That storage host resolves to a non-public address.", "")
			return
		case errors.As(err, &resolveErr) && resolveErr.Reason == "ssrf_blocked":
			writeError(w, r, s.logger, http.StatusBadRequest, "ssrf_blocked",
				"That storage host is not on this node's fetch allowlist.", "")
			return
		}
		writeError(w, r, s.logger, http.StatusBadGateway, "probe_failed",
			"The Pod could not be probed.", "")
		return
	}

	writeJSON(w, http.StatusOK, probe)
}

func (s *Server) handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, r, s.logger, http.StatusNotFound, "not_found",
		"No such endpoint on the Chainify API service.", "")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// decodeJSON is used by tests and future POST handlers; it caps the decoded payload.
func decodeJSON[T any](r *http.Request, maxBytes int64) (*T, error) {
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, maxBytes))
		_ = r.Body.Close()
	}()
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBytes))
	if err != nil {
		return nil, err
	}
	var out T
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
