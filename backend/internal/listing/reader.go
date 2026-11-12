// Package listing reads Chainify business documents published by other participants.
//
// The service already resolves WebIDs; this package reuses the same SSRF guard and
// transport for the second kind of fetch Chainify needs: a peer's public discovery
// index and the listings it points at. Nothing is stored. A document is fetched,
// reduced to the fields the caller asked for, and dropped.
package listing

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/chainify/backend/internal/identity"
)

// Document is the reduced view of a Chainify resource.
type Document struct {
	// URL is the address the document was actually fetched from.
	URL string `json:"url"`
	// WebID is the cfy:ownerWebId declared inside the document, when present.
	WebID string `json:"webId,omitempty"`
	// Name is the human title: business name for a profile, listing title otherwise.
	Name string `json:"name"`
	// Description is only carried for profiles; listings carry a summary instead.
	Description string `json:"description,omitempty"`
	Category    string `json:"category,omitempty"`
	Location    string `json:"location,omitempty"`
	Quantity    string `json:"quantity,omitempty"`
	Unit        string `json:"unit,omitempty"`
	Kind        string `json:"kind,omitempty"`
	// FetchedAt records when the peer answered, which is what makes a result stale
	// rather than wrong. Discovery results are never authoritative.
	FetchedAt time.Time `json:"fetchedAt"`
}

// ErrTooLarge is returned when a document exceeds the configured byte ceiling.
var ErrTooLarge = errors.New("document exceeds the configured size limit")

// Reader fetches and reduces outward-looking Chainify documents.
type Reader struct {
	guard      *identity.Guard
	transport  http.RoundTripper
	maxBytes   int64
	timeout    time.Duration
	clientOnce *http.Client
}

// NewReader builds a Reader sharing the guard and transport used for WebID resolution,
// so a new outbound path cannot quietly bypass the SSRF policy or TLS trust settings.
func NewReader(guard *identity.Guard, transport http.RoundTripper, maxBytes int64, timeout time.Duration) *Reader {
	if maxBytes <= 0 {
		maxBytes = 1 << 20
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Reader{
		guard:     guard,
		transport: transport,
		maxBytes:  maxBytes,
		timeout:   timeout,
		clientOnce: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
	}
}

// Fetch retrieves one document and reduces it to a Document.
//
// A blocked URL is returned as the guard's sentinel error so the HTTP layer can answer
// 400 instead of blaming the peer for a policy decision this node made.
func (r *Reader) Fetch(ctx context.Context, rawURL string) (*Document, error) {
	parsed, err := r.guard.Check(ctx, rawURL)
	if err != nil {
		return nil, err
	}

	body, contentType, err := r.get(ctx, parsed)
	if err != nil {
		return nil, err
	}

	triples, err := parse(body, contentType)
	if err != nil {
		return nil, err
	}
	doc := reduce(parsed.String(), triples)
	doc.FetchedAt = time.Now().UTC()
	if doc.Name == "" && doc.WebID == "" {
		return nil, errors.New("parse_failed")
	}
	return doc, nil
}

func (r *Reader) get(ctx context.Context, target *url.URL) ([]byte, string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/ld+json, application/json;q=0.9, text/turtle;q=0.8, */*;q=0.5")

	resp, err := r.clientOnce.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("fetch: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<10))
		_ = resp.Body.Close()
	}()

	switch {
	case resp.StatusCode == http.StatusNotFound:
		return nil, "", errors.New("document_not_found")
	case resp.StatusCode == http.StatusUnauthorized,
		resp.StatusCode == http.StatusForbidden:
		return nil, "", errors.New("document_forbidden")
	case resp.StatusCode == http.StatusTooManyRequests:
		return nil, "", errors.New("rate_limited")
	case resp.StatusCode >= 400:
		return nil, "", fmt.Errorf("upstream status %d", resp.StatusCode)
	}

	limited := io.LimitReader(resp.Body, r.maxBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", fmt.Errorf("read body: %w", err)
	}
	if int64(len(body)) > r.maxBytes {
		return nil, "", ErrTooLarge
	}
	return body, resp.Header.Get("Content-Type"), nil
}

// parse decodes whichever RDF serialisation the peer answered with. The content type
// decides; JSON is the fallback because Chainify itself always writes JSON-LD.
func parse(body []byte, contentType string) ([]identity.Triple, error) {
	lower := strings.ToLower(contentType)
	trimmed := strings.TrimSpace(string(body))
	if strings.Contains(lower, "turtle") ||
		(!strings.Contains(lower, "json") && strings.HasPrefix(trimmed, "@prefix")) ||
		(!strings.Contains(lower, "json") && strings.HasPrefix(trimmed, "PREFIX")) {
		return identity.ParseTurtle(trimmed)
	}
	return identity.ParseJSONLD(body)
}

// Vocabulary terms reduce needs to pull out of the generic triple list.
const (
	termName          = "https://schema.org/name"
	termDescription   = "https://schema.org/description"
	termCategory      = "https://schema.org/category"
	termLocation      = "https://chainify.local/ns#generalLocation"
	termOwner         = "https://chainify.local/ns#ownerWebId"
	termKind          = "https://chainify.local/ns#kind"
	termQuantityValue = "https://schema.org/value"
	termQuantityUnit  = "https://schema.org/unitText"
)

func reduce(sourceURL string, triples []identity.Triple) *Document {
	doc := &Document{URL: sourceURL}
	for _, triple := range triples {
		if !triple.Literal {
			// ownerWebId is written as an IRI, so it arrives as a resource value.
			if triple.Predicate == termOwner && doc.WebID == "" {
				doc.WebID = triple.Object
			}
			continue
		}
		switch triple.Predicate {
		case termOwner:
			if doc.WebID == "" {
				doc.WebID = triple.Object
			}
		case termName:
			if doc.Name == "" {
				doc.Name = triple.Object
			}
		case termDescription:
			if doc.Description == "" {
				doc.Description = triple.Object
			}
		case termCategory:
			if doc.Category == "" {
				doc.Category = triple.Object
			}
		case termLocation:
			if doc.Location == "" {
				doc.Location = triple.Object
			}
		case termKind:
			if doc.Kind == "" {
				doc.Kind = triple.Object
			}
		case termQuantityValue:
			if doc.Quantity == "" {
				doc.Quantity = triple.Object
			}
		case termQuantityUnit:
			if doc.Unit == "" {
				doc.Unit = triple.Object
			}
		}
	}
	return doc
}
