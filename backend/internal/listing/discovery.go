package listing

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/chainify/backend/internal/identity"
)

// Entry is one item advertised by a peer's public index.
type Entry struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
	// Category and Location let the UI filter without fetching every document.
	Category string `json:"category,omitempty"`
	Location string `json:"location,omitempty"`
	Quantity string `json:"quantity,omitempty"`
	Unit     string `json:"unit,omitempty"`
}

// PeerIndex is a participant's own claim about what it publishes.
type PeerIndex struct {
	Participant  string    `json:"participant"`
	IndexURL     string    `json:"indexUrl"`
	WebID        string    `json:"webId,omitempty"`
	DisplayName  string    `json:"displayName"`
	PublishedAt  string    `json:"publishedAt,omitempty"`
	Entries      []Entry   `json:"entries"`
	FetchedAt    time.Time `json:"fetchedAt"`
	Error        string    `json:"error,omitempty"`
	ErrorCode    string    `json:"errorCode,omitempty"`
	Status       int       `json:"status,omitempty"`
	Reachable    bool      `json:"reachable"`
	HiddenFields []string  `json:"hiddenFields,omitempty"`
}

// DiscoveryRequest asks the node to read a set of participants' public indexes.
type DiscoveryRequest struct {
	// Participants are the index URLs to read. The caller builds them from each
	// participant's storage root so this service never guesses a layout.
	Participants []string `json:"participants"`
	// Query filters entries locally, after fetching. Matching is case-insensitive
	// and applies to title, category, and location.
	Query string `json:"query"`
}

// DiscoveryResult is the merged, non-authoritative answer.
type DiscoveryResult struct {
	Peers []PeerIndex `json:"peers"`
	// Entries is the flattened list across peers, each carrying its source.
	Entries []ScoredEntry `json:"entries"`
	// QueriedAt / ElapsedMS make the staleness of the answer visible.
	QueriedAt time.Time `json:"queriedAt"`
	ElapsedMS int64     `json:"elapsedMs"`
	// Notes record what this node deliberately did not do.
	Notes []string `json:"notes"`
}

// ScoredEntry pairs an entry with the peer that published it.
type ScoredEntry struct {
	Entry
	Participant string `json:"participant"`
	Peer        string `json:"peer"`
}

// MaxParticipants bounds a single discovery fan-out so one request cannot be used to
// turn this node into an amplifier against many hosts.
const MaxParticipants = 24

// Discover fans out over participants with a bounded concurrency pool and merges the
// results. A failing peer is reported in its own PeerIndex rather than failing the call:
// one offline Pod must not blank the whole answer.
func (r *Reader) Discover(ctx context.Context, req DiscoveryRequest) *DiscoveryResult {
	started := time.Now()
	participants := dedupe(req.Participants)
	if len(participants) > MaxParticipants {
		participants = participants[:MaxParticipants]
	}

	result := &DiscoveryResult{
		QueriedAt: started.UTC(),
		Notes: []string{
			"Each result is a peer's own claim, read live from its Pod at the time shown.",
			"Nothing here is stored or cached by this node.",
			"Presence in an index means the owner opted in, not that any claim is true.",
		},
	}

	peers := make([]PeerIndex, len(participants))
	var wg sync.WaitGroup
	// A small fixed pool: enough to hide latency across a handful of Pods, small enough
	// that a demo laptop and a small provider both stay comfortable.
	sem := make(chan struct{}, 4)
	for index, participant := range participants {
		wg.Add(1)
		go func(slot int, participant string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			peers[slot] = r.readPeer(ctx, participant)
		}(index, participant)
	}
	wg.Wait()

	result.Peers = peers
	query := strings.ToLower(strings.TrimSpace(req.Query))
	for _, peer := range peers {
		if peer.Error != "" {
			continue
		}
		for _, entry := range peer.Entries {
			if query != "" && !matches(entry, query) {
				continue
			}
			result.Entries = append(result.Entries, ScoredEntry{
				Entry:       entry,
				Participant: peer.Participant,
				Peer:        peer.DisplayName,
			})
		}
	}
	if result.Entries == nil {
		result.Entries = []ScoredEntry{}
	}
	sort.SliceStable(result.Entries, func(a, b int) bool {
		return strings.ToLower(result.Entries[a].Title) < strings.ToLower(result.Entries[b].Title)
	})
	result.ElapsedMS = time.Since(started).Milliseconds()
	return result
}

func matches(entry Entry, query string) bool {
	haystack := strings.ToLower(strings.Join(
		[]string{entry.Title, entry.Category, entry.Location, entry.Kind}, " "))
	return strings.Contains(haystack, query)
}

// readPeer fetches one index and reduces it. The index document itself is small, so a
// second fetch per entry is avoided here: the index is expected to carry enough to list
// and filter, and a detail view fetches the listing on demand.
func (r *Reader) readPeer(ctx context.Context, participant string) PeerIndex {
	peer := PeerIndex{Participant: participant}
	parsed, err := r.guard.Check(ctx, participant)
	if err != nil {
		peer.Error, peer.ErrorCode = "URL ini diblokir oleh kebijakan fetch node.", codeFor(err)
		return peer
	}
	peer.IndexURL = parsed.String()

	body, contentType, err := r.get(ctx, parsed)
	if err != nil {
		peer.Error, peer.ErrorCode = messageFor(err), codeFor(err)
		peer.Status = statusFor(err)
		return peer
	}
	triples, err := parse(body, contentType)
	if err != nil {
		peer.Error, peer.ErrorCode = "Index tidak dapat dibaca sebagai RDF.", "parse_failed"
		return peer
	}

	peer.Reachable = true
	peer.FetchedAt = time.Now().UTC()
	peer.Entries = []Entry{}
	// The document's own subject separates the index's fields from each item's fields, so
	// the peer name never lands on the first row.
	indexSubject := ""
	for _, triple := range triples {
		if triple.Subject != "" && !strings.HasPrefix(triple.Subject, "_:") &&
			!isItemPredicate(triple.Predicate) && triple.Predicate != termOwner &&
			triple.Predicate != termGeneratedAt {
			indexSubject = triple.Subject
			break
		}
	}
	// Blank nodes group the items; grouping is done by subject so two peers advertising
	// the same title cannot merge into one row.
	bySubject := map[string]*Entry{}
	order := make([]string, 0, 8)
	// Terms repeated on the index document and on every item (name, kind) are resolved by
	// subject: the index subject gets the peer fields, an item subject gets the row.
	for _, triple := range triples {
		if triple.Predicate == termOwner {
			if peer.WebID == "" && triple.Object != "" {
				peer.WebID = triple.Object
			}
			continue
		}
		if !triple.Literal {
			continue
		}
		if triple.Predicate == termGeneratedAt {
			if peer.PublishedAt == "" {
				peer.PublishedAt = triple.Object
			}
			continue
		}
		if triple.Subject == indexSubject {
			if triple.Predicate == termName && peer.DisplayName == "" {
				peer.DisplayName = triple.Object
			}
			continue
		}
		if !isItemPredicate(triple.Predicate) {
			continue
		}
		item, ok := bySubject[triple.Subject]
		if !ok {
			item = &Entry{}
			bySubject[triple.Subject] = item
			order = append(order, triple.Subject)
		}
		applyItem(item, triple.Predicate, triple.Object)
	}
	for _, subject := range order {
		item := bySubject[subject]
		if subject != "" && strings.HasPrefix(subject, "http") {
			item.URL = subject
		}
		if item.Title == "" {
			continue
		}
		peer.Entries = append(peer.Entries, *item)
	}
	if peer.DisplayName == "" {
		peer.DisplayName = peer.WebID
	}
	// Recorded so the UI can say plainly which fields an index never carries.
	peer.HiddenFields = []string{"harga", "kontak", "alamat presisi", "dokumen privat"}
	return peer
}

func isItemPredicate(predicate string) bool {
	switch predicate {
	case termName, termCategory, termLocation, termKind, termQuantityValue, termQuantityUnit:
		return true
	}
	return false
}

func applyItem(item *Entry, predicate, value string) {
	switch predicate {
	case termName:
		if item.Title == "" {
			item.Title = value
		}
	case termCategory:
		if item.Category == "" {
			item.Category = value
		}
	case termLocation:
		if item.Location == "" {
			item.Location = value
		}
	case termKind:
		if item.Kind == "" {
			item.Kind = value
		}
	case termQuantityValue:
		if item.Quantity == "" {
			item.Quantity = value
		}
	case termQuantityUnit:
		if item.Unit == "" {
			item.Unit = value
		}
	}
}

// Terms used by the index document, kept beside the reader so a vocabulary change is
// made in one file. Item fields reuse the profile terms.
const (
	termGeneratedAt = "https://chainify.local/ns#generatedAt"
)

func dedupe(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		parsed, err := url.Parse(trimmed)
		if err != nil || parsed.Host == "" {
			continue
		}
		key := parsed.String()
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	return out
}

func codeFor(err error) string {
	switch {
	case errors.Is(err, identity.ErrBlockedScheme),
		errors.Is(err, identity.ErrBlockedCredentials),
		errors.Is(err, identity.ErrBlockedHost),
		errors.Is(err, identity.ErrBlockedPort),
		errors.Is(err, identity.ErrBlockedAddress):
		return "ssrf_blocked"
	case errors.Is(err, ErrTooLarge):
		return "profile_too_large"
	}
	message := err.Error()
	switch {
	case strings.Contains(message, "document_not_found"):
		return "webid_not_found"
	case strings.Contains(message, "document_forbidden"):
		return "webid_forbidden"
	case strings.Contains(message, "rate_limited"):
		return "rate_limited"
	}
	return "pod_unreachable"
}

func messageFor(err error) string {
	switch codeFor(err) {
	case "ssrf_blocked":
		return "Alamat ini tidak diizinkan oleh kebijakan fetch node."
	case "webid_not_found":
		return "Peserta belum menerbitkan index publik di alamat itu."
	case "webid_forbidden":
		return "Index publik menolak dibaca secara anonim."
	case "rate_limited":
		return "Provider membatasi laju permintaan node ini."
	case "profile_too_large":
		return "Index melebihi batas ukuran yang dibaca node."
	default:
		return "Pod peserta tidak dapat dihubungi."
	}
}

func statusFor(err error) int {
	switch codeFor(err) {
	case "webid_not_found":
		return http.StatusNotFound
	case "webid_forbidden":
		return http.StatusForbidden
	case "rate_limited":
		return http.StatusTooManyRequests
	}
	return 0
}
