// Package pod reports Pod reachability. It never copies Pod contents into service memory
// and never retains them between requests, which is what keeps this service out of the
// authoritative-catalog role the project docs forbid.
package pod

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/chainify/backend/internal/identity"
)

// Probe records one attempt to reach a Pod root over the network.
type Probe struct {
	URL         string    `json:"url"`
	Reachable   bool      `json:"reachable"`
	StatusCode  int       `json:"statusCode,omitempty"`
	LatencyMS   int64     `json:"latencyMs"`
	ContentType string    `json:"contentType,omitempty"`
	Reason      string    `json:"reason,omitempty"`
	CheckedAt   time.Time `json:"checkedAt"`
}

// Prober checks a Pod root without reading its data.
type Prober struct {
	guard  *identity.Guard
	client *http.Client
}

// NewProber builds a Prober sharing the identity resolver's SSRF policy, including the
// pinned dialer, so a Pod endpoint cannot rebind into an internal network.
func NewProber(guard *identity.Guard, timeout time.Duration) *Prober {
	return &Prober{
		guard: guard,
		client: &http.Client{
			Timeout:   timeout,
			Transport: guard.NewTransport(timeout),
			CheckRedirect: func(req *http.Request, _ []*http.Request) error {
				_, err := guard.Check(req.Context(), req.URL.String())
				return err
			},
		},
	}
}

// Check validates storageURL, issues one ranged GET, and returns a Probe.
//
// Only the network answer is retained: status, latency, content type. No body bytes are
// kept, so a successful probe does not turn this service into a copy of the owner's Pod.
func (p *Prober) Check(ctx context.Context, storageURL string) (*Probe, error) {
	target, err := p.guard.Check(ctx, storageURL)
	if err != nil {
		return nil, err
	}

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, err
	}
	// A plain GET on a container root: CSS answers 200 with a listing or a redirect.
	// A ranged request was tried here and rejected with 416, because a container has no
	// single byte range to serve; the probe then reported a healthy Pod as unreachable.
	// The body is never read beyond a few kilobytes, so nothing is mirrored either way.
	req.Header.Set("Accept", "text/turtle, application/ld+json;q=0.9, text/html;q=0.8, */*;q=0.5")

	start := time.Now()
	resp, err := p.client.Do(req)
	if err != nil {
		return &Probe{
			URL:       target.String(),
			LatencyMS: time.Since(start).Milliseconds(),
			CheckedAt: time.Now().UTC(),
			Reason:    "unreachable",
		}, nil
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<10))
		_ = resp.Body.Close()
	}()

	probe := Probe{
		URL:         target.String(),
		StatusCode:  resp.StatusCode,
		ContentType: firstToken(resp.Header.Get("Content-Type")),
		LatencyMS:   time.Since(start).Milliseconds(),
		CheckedAt:   time.Now().UTC(),
		Reachable:   resp.StatusCode < 400,
	}
	if !probe.Reachable {
		probe.Reason = reasonForStatus(resp.StatusCode)
	}
	return &probe, nil
}

func reasonForStatus(code int) string {
	switch code {
	case http.StatusUnauthorized:
		return "authorization_required"
	case http.StatusForbidden:
		return "access_denied"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusTooManyRequests:
		return "rate_limited"
	default:
		return fmt.Sprintf("http_%d", code)
	}
}

func firstToken(value string) string {
	return strings.TrimSpace(strings.SplitN(value, ";", 2)[0])
}
