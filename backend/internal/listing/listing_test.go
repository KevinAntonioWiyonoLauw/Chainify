package listing

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/chainify/backend/internal/identity"
)

// roundTripFunc lets a test answer fetches without a network.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func newTestReader(t *testing.T, bodies map[string]string) *Reader {
	t.Helper()
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body, ok := bodies[req.URL.String()]
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
	})
	guard := identity.NewGuard([]string{"localhost", "localhost:13000", "a.example", "b.example"})
	return NewReader(guard, transport, 1<<20, time.Second)
}

const peerIndex = `{
  "@context": {"@vocab": "https://schema.org/", "cfy": "https://chainify.local/ns#"},
  "@id": "https://a.example/index.jsonld",
  "@type": "BusinessFunction",
  "cfy:ownerWebId": {"@id": "https://a.example/profile/card#me"},
  "name": "Koperasi Tani Lembang",
  "cfy:generatedAt": "2026-11-10T08:00:00Z",
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "itemListElement": [
      {"@id": "https://a.example/l/1.jsonld", "@type": "Offer", "name": "Kopi Arabika", "category": "kopi", "cfy:generalLocation": "Lembang", "cfy:kind": "offer", "priceSpecification": {"@type": "UnitPriceSpecification", "value": 85000, "unitText": "kg"}},
      {"@id": "https://a.example/l/2.jsonld", "@type": "Offer", "name": "Beras Pandan Wangi", "category": "beras", "cfy:generalLocation": "Subang", "cfy:kind": "offer", "priceSpecification": {"@type": "UnitPriceSpecification", "value": 14000, "unitText": "kg"}}
    ]
  }
}`

func TestDiscoverMergesPeersAndKeepsEveryEntry(t *testing.T) {
	reader := newTestReader(t, map[string]string{
		"https://a.example/index.jsonld": peerIndex,
	})

	result := reader.Discover(context.Background(), DiscoveryRequest{
		Participants: []string{"https://a.example/index.jsonld"},
	})
	if len(result.Peers) != 1 {
		t.Fatalf("peers = %d, want 1", len(result.Peers))
	}
	peer := result.Peers[0]
	if !peer.Reachable {
		t.Fatalf("peer unreachable: %s", peer.Error)
	}
	if peer.DisplayName != "Koperasi Tani Lembang" {
		t.Fatalf("displayName = %q", peer.DisplayName)
	}
	if peer.WebID != "https://a.example/profile/card#me" {
		t.Fatalf("webId = %q", peer.WebID)
	}
	if len(result.Entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(result.Entries))
	}
	// Sorted by title so the UI list order is stable across peers.
	if result.Entries[0].Title != "Beras Pandan Wangi" {
		t.Fatalf("first entry = %q, want the alphabetically first title", result.Entries[0].Title)
	}
	if result.Entries[0].Participant != "https://a.example/index.jsonld" {
		t.Fatalf("entry lost its source peer: %q", result.Entries[0].Participant)
	}
}

func TestDiscoverReportsOneBadPeerWithoutFailingTheCall(t *testing.T) {
	reader := newTestReader(t, map[string]string{
		"https://a.example/index.jsonld": peerIndex,
	})

	result := reader.Discover(context.Background(), DiscoveryRequest{
		Participants: []string{"https://a.example/index.jsonld", "https://b.example/index.jsonld"},
	})
	if len(result.Peers) != 2 {
		t.Fatalf("peers = %d, want 2", len(result.Peers))
	}
	var failed, healthy int
	for _, peer := range result.Peers {
		if peer.Error != "" {
			failed++
			if peer.ErrorCode != "webid_not_found" {
				t.Errorf("errorCode = %q, want webid_not_found", peer.ErrorCode)
			}
			continue
		}
		healthy++
	}
	if failed != 1 || healthy != 1 {
		t.Fatalf("failed=%d healthy=%d, want 1 and 1", failed, healthy)
	}
	if len(result.Entries) != 2 {
		t.Fatalf("entries = %d, want the reachable peer's entries only", len(result.Entries))
	}
}

func TestDiscoverFiltersLocallyAndDedupesParticipants(t *testing.T) {
	reader := newTestReader(t, map[string]string{
		"https://a.example/index.jsonld": peerIndex,
	})

	result := reader.Discover(context.Background(), DiscoveryRequest{
		Participants: []string{"https://a.example/index.jsonld", "https://a.example/index.jsonld", "  "},
		Query:        "kopi",
	})
	if len(result.Peers) != 1 {
		t.Fatalf("peers = %d, want the duplicate collapsed", len(result.Peers))
	}
	if len(result.Entries) != 1 || result.Entries[0].Title != "Kopi Arabika" {
		t.Fatalf("entries = %#v, want only the kopi row", result.Entries)
	}
}

func TestDiscoverCapsParticipants(t *testing.T) {
	participants := make([]string, 0, MaxParticipants+10)
	for i := 0; i <= MaxParticipants+9; i++ {
		participants = append(participants, "https://a.example/"+strings.Repeat("x", i+1)+"/index.jsonld")
	}
	reader := newTestReader(t, nil)
	result := reader.Discover(context.Background(), DiscoveryRequest{Participants: participants})
	if len(result.Peers) != MaxParticipants {
		t.Fatalf("peers = %d, want the cap of %d", len(result.Peers), MaxParticipants)
	}
}

func TestDiscoverBlocksNonPublicTargets(t *testing.T) {
	reader := newTestReader(t, nil)
	result := reader.Discover(context.Background(), DiscoveryRequest{
		Participants: []string{"http://169.254.169.254/latest/meta-data/"},
	})
	if len(result.Peers) != 1 {
		t.Fatalf("peers = %d, want 1", len(result.Peers))
	}
	if result.Peers[0].ErrorCode != "ssrf_blocked" {
		t.Fatalf("errorCode = %q, want ssrf_blocked", result.Peers[0].ErrorCode)
	}
}

func TestVerifyPassesAWellFormedListingAndStillRefusesToClaimTruth(t *testing.T) {
	reader := newTestReader(t, map[string]string{
		"https://a.example/l/1.jsonld": `{
      "@context": {"@vocab": "https://schema.org/", "cfy": "https://chainify.local/ns#"},
      "@id": "https://a.example/profile/card#me",
      "@type": "Offer",
      "cfy:ownerWebId": {"@id": "https://a.example/profile/card#me"},
      "name": "Kopi Arabika",
      "category": "kopi",
      "cfy:kind": "offer",
      "cfy:generalLocation": "Lembang"
    }`,
	})

	verification, err := reader.Verify(context.Background(), "https://a.example/l/1.jsonld")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if len(verification.Checks) == 0 {
		t.Fatal("verification returned no checks")
	}
	if verification.Verdict == "pass" {
		t.Fatal("a document from a prototype cannot reach a clean pass: the tier check must hold it at warn")
	}
	if verification.Verdict != "warn" {
		t.Fatalf("verdict = %q, want warn", verification.Verdict)
	}
	if len(verification.Limits) == 0 {
		t.Fatal("verification must state what it cannot establish")
	}
	for _, check := range verification.Checks {
		if check.Result == "" || check.Detail == "" {
			t.Fatalf("check %q has no result or detail", check.ID)
		}
	}
}

func TestVerifyFailsADocumentWithoutAnOwner(t *testing.T) {
	reader := newTestReader(t, map[string]string{
		"https://a.example/l/2.jsonld": `{
      "@context": {"@vocab": "https://schema.org/"},
      "@type": "Offer",
      "name": "Beras"
    }`,
	})
	verification, err := reader.Verify(context.Background(), "https://a.example/l/2.jsonld")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if verification.Verdict != "fail" {
		t.Fatalf("verdict = %q, want fail for a document with no owner", verification.Verdict)
	}
}

func TestVerifyRejectsBlockedAddress(t *testing.T) {
	reader := newTestReader(t, nil)
	if _, err := reader.Verify(context.Background(), "http://127.0.0.1/admin"); err == nil {
		t.Fatal("want a guard error for a loopback address")
	}
}
