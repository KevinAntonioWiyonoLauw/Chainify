// Package identity resolves a WebID into the facts Chainify needs to talk to a Pod:
// where the owner's storage is, and which issuer vouches for them.
//
// The resolver is stateless. It never stores the result, never logs tokens, and refuses
// to fetch anything the SSRF guard has not approved.
package identity

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// Profile is the result of resolving a WebID document.
type Profile struct {
	// WebID is the subject URI that was fetched.
	WebID string `json:"webId"`
	// Storage holds every pim:storage value found in the profile.
	// A WebID can legitimately point at more than one Pod.
	Storage []string `json:"storage"`
	// Issuer is the oidcIssuer declared on the profile, when present.
	Issuer string `json:"issuer,omitempty"`
	// ResolvedAt is when the fetch completed. Discovery results are never authoritative
	// forever, so freshness is part of the payload.
	ResolvedAt time.Time `json:"resolvedAt"`
	// SourceContentType records what the provider actually returned.
	SourceContentType string `json:"sourceContentType,omitempty"`
}

// ResolveError carries a stable reason code so the HTTP layer can map it without
// inspecting error strings.
type ResolveError struct {
	Reason string
	Err    error
}

func (e *ResolveError) Error() string {
	if e.Err == nil {
		return e.Reason
	}
	return e.Reason + ": " + e.Err.Error()
}

func (e *ResolveError) Unwrap() error { return e.Err }

// Resolver fetches and interprets WebID profiles.
type Resolver struct {
	guard   *Guard
	client  *http.Client
	maxByte int64
	timeout time.Duration
}

// NewResolver builds a Resolver whose HTTP client re-validates every redirect and dials
// only through a transport pinned to guard-approved addresses.
func NewResolver(guard *Guard, maxBytes int64, timeout time.Duration) *Resolver {
	return &Resolver{
		guard:   guard,
		maxByte: maxBytes,
		timeout: timeout,
		client: &http.Client{
			Timeout:   timeout,
			Transport: guard.NewTransport(timeout),
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return errors.New("too many redirects")
				}
				_, err := guard.Check(req.Context(), req.URL.String())
				return err
			},
		},
	}
}

// Guard exposes the SSRF guard so other outbound readers can share one policy.
func (r *Resolver) Guard() *Guard { return r.guard }

// Resolve fetches webID, parses it, and returns the storage and issuer it declares.
//
// The URL is guarded before the request and again on every redirect, so this is safe to
// call with unvalidated user input.
func (r *Resolver) Resolve(ctx context.Context, webID string) (*Profile, error) {
	target, err := r.guard.Check(ctx, webID)
	if err != nil {
		return nil, &ResolveError{Reason: "ssrf_blocked", Err: err}
	}

	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, &ResolveError{Reason: "bad_request", Err: err}
	}
	// Turtle first: it is the cheapest Solid profile to parse and what CSS serves.
	req.Header.Set("Accept", "text/turtle;q=1.0, application/ld+json;q=0.9, application/json;q=0.8, */*;q=0.5")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, &ResolveError{Reason: "pod_unreachable", Err: err}
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, &ResolveError{Reason: statusReason(resp.StatusCode), Err: fmt.Errorf("profile fetch returned %s", resp.Status)}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, r.maxByte+1))
	if err != nil {
		return nil, &ResolveError{Reason: "read_failed", Err: err}
	}
	if int64(len(body)) > r.maxByte {
		return nil, &ResolveError{Reason: "profile_too_large", Err: fmt.Errorf("profile exceeds %d bytes", r.maxByte)}
	}

	contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	// Turtle resolves "<>" and other relative IRIs against the document URL. The
	// fragment identifies the subject inside the document, so it is dropped: the graph
	// named by "<>" is the document, not "#me".
	documentURL := *resp.Request.URL
	documentURL.Fragment = ""
	triples, parseErr := r.extract(body, contentType, documentURL.String())
	if parseErr != nil {
		return nil, &ResolveError{Reason: "parse_failed", Err: parseErr}
	}

	profile := &Profile{
		WebID:             target.String(),
		Storage:           valuesFor(triples, PimStorage),
		Issuer:            firstValueFor(triples, SolidIssuer),
		ResolvedAt:        time.Now().UTC(),
		SourceContentType: contentType,
	}
	if profile.Storage == nil {
		profile.Storage = []string{}
	}
	return profile, nil
}

func (r *Resolver) extract(body []byte, contentType, documentURL string) ([]Triple, error) {
	switch contentType {
	case "application/ld+json", "application/json":
		if triples, err := ParseJSONLD(body); err == nil {
			return triples, nil
		}
		// Fall through: providers routinely mislabel Turtle as JSON.
	}

	triples, turtleErr := ParseTurtleWithBase(string(body), documentURL)
	if turtleErr == nil {
		return triples, nil
	}
	if ldTriples, ldErr := ParseJSONLD(body); ldErr == nil {
		return ldTriples, nil
	}
	return nil, turtleErr
}

func statusReason(code int) string {
	switch {
	case code == http.StatusNotFound:
		return "webid_not_found"
	case code == http.StatusForbidden:
		return "webid_forbidden"
	case code == http.StatusUnauthorized:
		return "webid_requires_auth"
	case code == http.StatusTooManyRequests:
		return "rate_limited"
	case code >= 500:
		return "pod_error"
	default:
		return "unexpected_status"
	}
}

func valuesFor(triples []Triple, predicate string) []string {
	var out []string
	for _, t := range triples {
		if t.Predicate == predicate && t.Object != "" {
			out = append(out, normalizeIRI(t.Object))
		}
	}
	return dedupe(out)
}

func firstValueFor(triples []Triple, predicate string) string {
	for _, t := range triples {
		if t.Predicate == predicate && t.Object != "" {
			return normalizeIRI(t.Object)
		}
	}
	return ""
}

// normalizeIRI trims parser whitespace and ensures a path-less Pod root keeps its
// trailing slash, which callers rely on to build resource paths.
func normalizeIRI(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return trimmed
	}
	if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
		return trimmed
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return trimmed
	}
	if parsed.Path == "" && parsed.RawQuery == "" && parsed.Fragment == "" {
		parsed.Path = "/"
		return parsed.String()
	}
	return trimmed
}

func dedupe(in []string) []string {
	if len(in) < 2 {
		return in
	}
	slices.Sort(in)
	return slices.Compact(in)
}
