package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/chainify/backend/internal/identity"
	"github.com/chainify/backend/internal/listing"
)

// discoveryRequestBody is the POST shape for a discovery query. It is a body rather than a
// query string because a participant list of 24 URLs does not fit a URL politely.
type discoveryRequestBody struct {
	Participants []string `json:"participants"`
	Query        string   `json:"query"`
}

// handleDiscovery reads a set of participants' public indexes and merges them.
//
// The node stores nothing. Every result carries the peer it came from and when it was
// read, so a caller can tell a stale answer from a wrong one.
func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	if s.listings == nil {
		writeError(w, r, s.logger, http.StatusServiceUnavailable, "discovery_unavailable",
			"Discovery is not configured on this node.", "")
		return
	}

	payload, err := decodeJSON[discoveryRequestBody](r, 64<<10)
	if err != nil {
		writeError(w, r, s.logger, http.StatusBadRequest, "bad_request",
			"Body must be JSON with a 'participants' array.", "")
		return
	}
	if len(payload.Participants) == 0 {
		writeError(w, r, s.logger, http.StatusBadRequest, "missing_participants",
			"Provide at least one participant index URL.", "")
		return
	}

	result := s.listings.Discover(r.Context(), listing.DiscoveryRequest{
		Participants: payload.Participants,
		Query:        payload.Query,
	})
	writeJSON(w, http.StatusOK, result)
}

// handleVerify reports the structural checks for one document.
//
// It answers 200 even when the verdict is "fail": a failed check is a successful read of a
// document that has a problem, and the caller needs the details.
func (s *Server) handleVerify(w http.ResponseWriter, r *http.Request) {
	if s.listings == nil {
		writeError(w, r, s.logger, http.StatusServiceUnavailable, "verification_unavailable",
			"Verification is not configured on this node.", "")
		return
	}
	target := firstNonEmpty(r.URL.Query().Get("url"), r.URL.Query().Get("document"))
	if r.Method == http.MethodPost {
		body, err := decodeJSON[struct {
			URL string `json:"url"`
		}](r, 8<<10)
		if err == nil && body != nil {
			target = firstNonEmpty(target, body.URL)
		}
	}
	if target == "" {
		writeError(w, r, s.logger, http.StatusBadRequest, "missing_url",
			"Provide a document URL via the 'url' query parameter.", "")
		return
	}

	verification, err := s.listings.Verify(r.Context(), target)
	if err != nil {
		s.writeListingError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, verification)
}

// handleDocument returns the reduced view of one Chainify document: title, owner, kind, and
// the quantity fields. It never returns prices or contacts, because those are not part of
// the reduced view at all.
func (s *Server) handleDocument(w http.ResponseWriter, r *http.Request) {
	if s.listings == nil {
		writeError(w, r, s.logger, http.StatusServiceUnavailable, "discovery_unavailable",
			"Document reading is not configured on this node.", "")
		return
	}
	target := firstNonEmpty(r.URL.Query().Get("url"), r.URL.Query().Get("document"))
	if target == "" {
		writeError(w, r, s.logger, http.StatusBadRequest, "missing_url",
			"Provide a document URL via the 'url' query parameter.", "")
		return
	}
	document, err := s.listings.Fetch(r.Context(), target)
	if err != nil {
		s.writeListingError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, document)
}

// writeListingError maps reader failures onto the same vocabulary identity resolution uses,
// so the frontend has one error table instead of two.
func (s *Server) writeListingError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, identity.ErrBlockedScheme),
		errors.Is(err, identity.ErrBlockedCredentials),
		errors.Is(err, identity.ErrBlockedHost),
		errors.Is(err, identity.ErrBlockedPort),
		errors.Is(err, identity.ErrBlockedAddress):
		writeError(w, r, s.logger, http.StatusBadRequest, "ssrf_blocked",
			"That address is not allowed by this node's fetch policy.", "")
		return
	case errors.Is(err, listing.ErrTooLarge):
		writeError(w, r, s.logger, http.StatusBadRequest, "profile_too_large",
			"That document exceeds this node's size limit.", "")
		return
	}

	reason := err.Error()
	code := reason
	if idx := strings.Index(reason, ":"); idx > 0 && !strings.Contains(reason[:idx], " ") {
		code = reason[:idx]
	}
	switch code {
	case "document_not_found":
		code = "webid_not_found"
	case "document_forbidden":
		code = "webid_forbidden"
	case "parse_failed":
		writeError(w, r, s.logger, http.StatusBadRequest, "parse_failed",
			"That document could not be parsed as RDF.", "")
		return
	case "rate_limited", "webid_not_found", "webid_forbidden":
	default:
		code = "pod_unreachable"
	}
	writeError(w, r, s.logger, statusForReason(code), code, resolutionMessage(code), "")
}
