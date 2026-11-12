package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chainify/backend/internal/config"
	"github.com/chainify/backend/internal/identity"
	"github.com/chainify/backend/internal/pod"
)

// newTestServer wires the real handler stack against an allowlist that contains no
// reachable provider, so every outbound call fails closed instead of hitting the network.
func newTestServer(t *testing.T) *Server {
	t.Helper()
	cfg := config.Config{
		Addr:            ":0",
		AllowedOrigins:  []string{"http://localhost:3000"},
		FetchAllowlist:  []string{"css", "css:3000", "localhost", "localhost:3000", ".solidcommunity.net"},
		CSSIssuerURL:    "http://localhost:3001/",
		FetchTimeout:    500 * time.Millisecond,
		MaxProfileBytes: 1 << 20,
		LogLevel:        "error",
	}
	guard := identity.NewGuard(cfg.FetchAllowlist)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New(cfg, logger, identity.NewResolver(guard, cfg.MaxProfileBytes, cfg.FetchTimeout), pod.NewProber(guard, cfg.FetchTimeout))
}

func doRequest(t *testing.T, s *Server, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func decodeInto(t *testing.T, rec *httptest.ResponseRecorder, target any) error {
	t.Helper()
	return json.Unmarshal(rec.Body.Bytes(), target)
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) errorBody {
	t.Helper()
	var body errorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not the error envelope: %v\nbody: %s", err, rec.Body.String())
	}
	return body
}

func TestHealthz(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet, "/healthz", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if payload["status"] != "ok" || payload["service"] != "chainify-api" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestResolveRequiresWebID(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet, "/api/identity/resolve", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "missing_webid" {
		t.Fatalf("error = %q, want missing_webid", body.Error)
	}
}

func TestResolveRejectsHostOutsideAllowlist(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet,
		"/api/identity/resolve?webid=http://169.254.169.254/latest/meta-data/", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an SSRF attempt", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "ssrf_blocked" {
		t.Fatalf("error = %q, want ssrf_blocked", body.Error)
	}
}

func TestResolveRejectsNonHTTPScheme(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet,
		"/api/identity/resolve?webid=file:///etc/passwd", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "ssrf_blocked" {
		t.Fatalf("error = %q, want ssrf_blocked", body.Error)
	}
}

// Regression test: Prober.Check returns guard sentinels directly, so the handler must map
// them to 400 rather than reporting an upstream failure.
func TestProbeMapsSSRFRejectionToBadRequest(t *testing.T) {
	s := newTestServer(t)
	cases := []string{
		"/api/pod/probe?storage=http://169.254.169.254/",
		"/api/pod/probe?storage=http://internal-service:8080/admin",
		"/api/pod/probe?storage=file:///etc/passwd",
		"/api/pod/probe?storage=http://user:pass@localhost:3000/pod/",
	}
	for _, target := range cases {
		rec := doRequest(t, s, http.MethodGet, target, nil)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s status = %d, want 400", target, rec.Code)
			continue
		}
		if body := decodeError(t, rec); body.Error != "ssrf_blocked" {
			t.Errorf("%s error = %q, want ssrf_blocked", target, body.Error)
		}
	}
}

func TestProbeRequiresStorage(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet, "/api/pod/probe", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "missing_storage" {
		t.Fatalf("error = %q, want missing_storage", body.Error)
	}
}

func TestMetaDeclaresNoAuthoritativeCatalog(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet, "/api/meta", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if payload["authoritativeStore"] != "solid-pod" {
		t.Fatalf("authoritativeStore = %v, want solid-pod", payload["authoritativeStore"])
	}
	notes, _ := payload["notes"].([]any)
	if len(notes) == 0 {
		t.Fatal("meta must state the Phase 1 limitations")
	}
}

func TestCORSAllowsOnlyConfiguredOrigin(t *testing.T) {
	s := newTestServer(t)

	allowed := doRequest(t, s, http.MethodGet, "/healthz", map[string]string{"Origin": "http://localhost:3000"})
	if got := allowed.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allow-origin = %q, want the configured origin", got)
	}
	if allowed.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatal("credentialed CORS must stay disabled: the browser owns the Solid session")
	}

	denied := doRequest(t, s, http.MethodGet, "/healthz", map[string]string{"Origin": "https://evil.example"})
	if got := denied.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("allow-origin = %q for an unconfigured origin, want empty", got)
	}
}

func TestPreflightReturnsNoContent(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodOptions, "/api/identity/resolve",
		map[string]string{"Origin": "http://localhost:3000"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	// The browser will not send a POST whose preflight does not name it. Discovery and
	// listing verification are both POST-only routes, so the advertised set has to
	// carry POST or those calls never leave the page.
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, OPTIONS" {
		t.Fatalf("allow-methods = %q, want GET, POST, OPTIONS", got)
	}
	// A preflight that asks for a header the server does not name is still refused, so
	// the allowed set must cover what the app actually sends.
	for _, wanted := range []string{"Accept", "Content-Type", "X-Request-Id"} {
		if !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), wanted) {
			t.Errorf("allow-headers is missing %q: %q", wanted, rec.Header().Get("Access-Control-Allow-Headers"))
		}
	}
}

// A provider that answers over TLS must report as reachable. The default issuer used to
// be http://, which the local https provider rejects with a plaintext-request error, so
// a healthy stack reported "unreachable" on every readiness check.
func TestReadyReportsProviderStatus(t *testing.T) {
	provider := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("@prefix ldp: <http://www.w3.org/ns/ldp#>.\n<> a ldp:Container.\n"))
	}))
	defer provider.Close()

	s := newTestServer(t)
	s.cfg.CSSIssuerURL = provider.URL + "/"
	s.UseProviderTransport(provider.Client().Transport)

	rec := doRequest(t, s, http.MethodGet, "/readyz", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		Status   string         `json:"status"`
		Provider map[string]any `json:"provider"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode ready payload: %v", err)
	}
	if body.Provider["reachable"] != true {
		t.Fatalf("provider = %v, want reachable", body.Provider)
	}
	if code, ok := body.Provider["statusCode"].(float64); !ok || int(code) != http.StatusOK {
		t.Fatalf("statusCode = %v, want 200", body.Provider["statusCode"])
	}
}

// The reason field has to distinguish a stopped provider from a wrong scheme, or the
// operator has to guess which one to fix.
func TestReadyExplainsProviderFailure(t *testing.T) {
	s := newTestServer(t)
	// Port 1 in the allowlist host is unreachable; the probe must say so without
	// collapsing every possible cause into the same word.
	s.cfg.CSSIssuerURL = "http://localhost:1/"
	rec := doRequest(t, s, http.MethodGet, "/readyz", nil)

	var body struct {
		Provider map[string]any `json:"provider"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode ready payload: %v", err)
	}
	if body.Provider["reachable"] != false {
		t.Fatalf("provider = %v, want unreachable", body.Provider)
	}
	if got, _ := body.Provider["reason"].(string); got != "unreachable" {
		t.Fatalf("reason = %q, want unreachable", got)
	}
	if detail, _ := body.Provider["detail"].(string); detail == "" {
		t.Fatal("detail is empty: the failure cause is not reported")
	}
}

func TestPreflightForUnconfiguredOriginAdvertisesNothing(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodOptions, "/api/discovery/query",
		map[string]string{"Origin": "https://evil.example"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	for _, header := range []string{
		"Access-Control-Allow-Origin",
		"Access-Control-Allow-Methods",
		"Access-Control-Allow-Headers",
	} {
		if got := rec.Header().Get(header); got != "" {
			t.Errorf("%s = %q for an unconfigured origin, want empty", header, got)
		}
	}
}

func TestSecurityHeadersAreAlwaysSet(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet, "/healthz", nil)
	for header, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"Cache-Control":          "no-store",
		"Referrer-Policy":        "no-referrer",
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
}

func TestUnknownRouteReturnsStructured404(t *testing.T) {
	s := newTestServer(t)
	rec := doRequest(t, s, http.MethodGet, "/api/does-not-exist", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "not_found" {
		t.Fatalf("error = %q, want not_found", body.Error)
	}
}

func TestQueryValuesNeverAppearInLogs(t *testing.T) {
	target := "/api/identity/resolve?webid=https://a.example/profile/card#me"
	req := httptest.NewRequest(http.MethodGet, target, nil)
	got := sanitizeTarget(req)
	if strings.Contains(got, "a.example") {
		t.Fatalf("sanitizeTarget = %q, want the query value removed", got)
	}
	if !strings.Contains(got, "webid=***") {
		t.Fatalf("sanitizeTarget = %q, want the parameter name preserved", got)
	}
}

func TestStatusForReasonSeparatesCallerAndUpstreamFaults(t *testing.T) {
	cases := map[string]int{
		"ssrf_blocked":        http.StatusBadRequest,
		"parse_failed":        http.StatusBadRequest,
		"webid_not_found":     http.StatusNotFound,
		"webid_forbidden":     http.StatusForbidden,
		"webid_requires_auth": http.StatusUnauthorized,
		"rate_limited":        http.StatusTooManyRequests,
		"pod_unreachable":     http.StatusBadGateway,
		"pod_error":           http.StatusBadGateway,
	}
	for reason, want := range cases {
		if got := statusForReason(reason); got != want {
			t.Errorf("statusForReason(%q) = %d, want %d", reason, got, want)
		}
	}
}
