package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chainify/backend/internal/identity"
	"github.com/chainify/backend/internal/listing"
)

type fixedTransport map[string]string

func (f fixedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	body, ok := f[req.URL.String()]
	if !ok {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     http.Header{},
			Request:    req,
		}, nil
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/ld+json"}},
		Request:    req,
	}, nil
}

// newServerWithListing swaps in a reader backed by a fixed transport, so a route test never
// touches the network.
func newServerWithListing(t *testing.T, bodies map[string]string) *Server {
	t.Helper()
	server := newTestServer(t)
	guard := identity.NewGuard([]string{"a.example", "localhost:13000"})
	server.SetListingReader(listing.NewReader(guard, fixedTransport(bodies), 1<<20, time.Second))
	return server
}

func postJSON(t *testing.T, server *Server, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	return rec
}

const routeIndex = `{
  "@context": {"@vocab": "https://schema.org/", "cfy": "https://chainify.local/ns#"},
  "@id": "https://a.example/index.jsonld",
  "@type": "BusinessFunction",
  "cfy:ownerWebId": {"@id": "https://a.example/profile/card#me"},
  "name": "Koperasi Tani Lembang",
  "cfy:generatedAt": "2026-11-10T08:00:00Z",
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "itemListElement": [
      {"@id": "https://a.example/l/1.jsonld", "name": "Kopi Arabika", "category": "kopi", "cfy:generalLocation": "Lembang", "cfy:kind": "offer"}
    ]
  }
}`

func TestDiscoveryRequiresParticipants(t *testing.T) {
	server := newServerWithListing(t, nil)
	rec := postJSON(t, server, "/api/discovery/query", `{"participants":[]}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "missing_participants" {
		t.Fatalf("error = %q, want missing_participants", body.Error)
	}
}

func TestDiscoveryReturnsMergedEntries(t *testing.T) {
	server := newServerWithListing(t, map[string]string{
		"https://a.example/index.jsonld": routeIndex,
	})
	rec := postJSON(t, server, "/api/discovery/query", `{"participants":["https://a.example/index.jsonld"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Peers   []map[string]any `json:"peers"`
		Entries []map[string]any `json:"entries"`
		Notes   []string         `json:"notes"`
	}
	if err := decodeInto(t, rec, &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Peers) != 1 || len(payload.Entries) != 1 {
		t.Fatalf("peers=%d entries=%d, want 1 and 1", len(payload.Peers), len(payload.Entries))
	}
	if payload.Entries[0]["title"] != "Kopi Arabika" {
		t.Fatalf("title = %v", payload.Entries[0]["title"])
	}
	if len(payload.Notes) == 0 {
		t.Fatal("discovery must declare that results are non-authoritative")
	}
}

func TestDiscoveryRejectsBlockedAddressPerPeer(t *testing.T) {
	server := newServerWithListing(t, nil)
	rec := postJSON(t, server, "/api/discovery/query", `{"participants":["http://169.254.169.254/latest/"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 with a per-peer error", rec.Code)
	}
	var payload struct {
		Peers []struct {
			ErrorCode string `json:"errorCode"`
		} `json:"peers"`
	}
	if err := decodeInto(t, rec, &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Peers) != 1 || payload.Peers[0].ErrorCode != "ssrf_blocked" {
		t.Fatalf("peers = %#v, want one ssrf_blocked peer", payload.Peers)
	}
}

func TestVerifyRequiresURL(t *testing.T) {
	server := newServerWithListing(t, nil)
	rec := doRequest(t, server, http.MethodGet, "/api/listing/verify", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "missing_url" {
		t.Fatalf("error = %q, want missing_url", body.Error)
	}
}

func TestVerifyMapsBlockedAddressToBadRequest(t *testing.T) {
	server := newServerWithListing(t, nil)
	rec := doRequest(t, server, http.MethodGet, "/api/listing/verify?url=http://127.0.0.1/admin", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if body := decodeError(t, rec); body.Error != "ssrf_blocked" {
		t.Fatalf("error = %q, want ssrf_blocked", body.Error)
	}
}

func TestVerifyReturnsChecksAndRefusesToClaimTruth(t *testing.T) {
	server := newServerWithListing(t, map[string]string{
		"https://a.example/l/1.jsonld": `{
      "@context": {"@vocab": "https://schema.org/", "cfy": "https://chainify.local/ns#"},
      "@id": "https://a.example/l/1.jsonld",
      "@type": "Offer",
      "cfy:ownerWebId": {"@id": "https://a.example/profile/card#me"},
      "name": "Kopi Arabika",
      "category": "kopi",
      "cfy:kind": "offer"
    }`,
	})
	rec := doRequest(t, server, http.MethodGet, "/api/listing/verify?url=https://a.example/l/1.jsonld", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Verdict string   `json:"verdict"`
		Checks  []any    `json:"checks"`
		Limits  []string `json:"limits"`
	}
	if err := decodeInto(t, rec, &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Checks) == 0 {
		t.Fatal("verify returned no checks")
	}
	if payload.Verdict == "pass" {
		t.Fatal("a prototype document must not reach a clean pass")
	}
	if len(payload.Limits) == 0 {
		t.Fatal("verify must state what it cannot establish")
	}
}

func TestMetaReportsPhase2AndParticipantCap(t *testing.T) {
	server := newTestServer(t)
	rec := doRequest(t, server, http.MethodGet, "/api/meta", nil)
	var payload map[string]any
	if err := decodeInto(t, rec, &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload["phase"] != float64(2) {
		t.Fatalf("phase = %v, want 2", payload["phase"])
	}
	if payload["maxParticipants"] != float64(listing.MaxParticipants) {
		t.Fatalf("maxParticipants = %v", payload["maxParticipants"])
	}
}
