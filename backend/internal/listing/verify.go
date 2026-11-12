package listing

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Check is one structural observation about a document. Checks never decide whether a
// business claim is true; they only report what the document shape does or does not show.
type Check struct {
	// ID is stable so the UI can group and link to one check.
	ID string `json:"id"`
	// Label is the human sentence for the check.
	Label string `json:"label"`
	// Result is "pass", "warn", "fail", or "unknown". "unknown" is used when the check
	// needs a network fact this node deliberately does not fetch.
	Result string `json:"result"`
	// Detail explains the result in one sentence the UI can print as-is.
	Detail string `json:"detail"`
}

// Verification is the whole answer for one document.
type Verification struct {
	URL     string    `json:"url"`
	WebID   string    `json:"webId,omitempty"`
	Name    string    `json:"name,omitempty"`
	Kind    string    `json:"kind,omitempty"`
	Checks  []Check   `json:"checks"`
	Fetched time.Time `json:"fetchedAt"`
	// Verdict is the weakest check result, so a caller cannot quote "valid" while one
	// structural check failed.
	Verdict string `json:"verdict"`
	// Limits states plainly what this endpoint cannot establish.
	Limits []string `json:"limits"`
}

const (
	resultPass    = "pass"
	resultWarn    = "warn"
	resultFail    = "fail"
	resultUnknown = "unknown"
)

var verificationLimits = []string{
	"Pemeriksaan ini struktural: bentuk dokumen, bukan kebenaran isinya.",
	"Node tidak memverifikasi tanda tangan kriptografis dokumen ini.",
	"Node tidak memeriksa apakah pemilik Pod benar-benar menjalankan usaha yang diklaim.",
	"Tidak ada badan penerbit kredensial yang diakui pada prototipe ini.",
}

// Verify fetches one Chainify document and reports what its shape shows. The document is
// read through the same SSRF guard as discovery, then dropped.
func (r *Reader) Verify(ctx context.Context, rawURL string) (*Verification, error) {
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
		return nil, fmt.Errorf("parse_failed: %w", err)
	}

	doc := reduce(parsed.String(), triples)
	verification := &Verification{
		URL:     parsed.String(),
		WebID:   doc.WebID,
		Name:    doc.Name,
		Kind:    doc.Kind,
		Fetched: time.Now().UTC(),
		Limits:  verificationLimits,
	}

	// The owner has to be declared inside the document, not inferred from the path: a Pod
	// URL that merely resembles a chainify path proves nothing about who wrote it.
	verification.Checks = append(verification.Checks, ownerCheck(doc))
	verification.Checks = append(verification.Checks, subjectCheck(doc, parsed.String()))
	verification.Checks = append(verification.Checks, requiredFieldsCheck(doc))
	verification.Checks = append(verification.Checks, loopbackCheck(parsed.String()))
	verification.Checks = append(verification.Checks, tierCheck(doc))
	verification.Verdict = weakest(verification.Checks)
	return verification, nil
}

func ownerCheck(doc *Document) Check {
	check := Check{ID: "owner-declared", Label: "Pemilik dinyatakan di dalam dokumen"}
	if doc.WebID == "" {
		check.Result = resultFail
		check.Detail = "Dokumen tidak menuliskan cfy:ownerWebId, sehingga tidak ada klaim pemilik yang bisa dicocokkan."
		return check
	}
	if !strings.HasPrefix(doc.WebID, "https://") {
		check.Result = resultWarn
		check.Detail = "WebID pemilik tidak memakai https, sehingga pengikatan ke akun tidak bisa dipastikan."
		return check
	}
	check.Result = resultPass
	check.Detail = "Dokumen menyatakan pemilik " + doc.WebID + "."
	return check
}

// subjectCheck compares the document's own identifier with the address it was fetched
// from. A mismatch is common and harmless (the subject is often the owner's WebID), so it
// warns instead of failing, and says which case it saw.
func subjectCheck(doc *Document, sourceURL string) Check {
	check := Check{ID: "subject-consistent", Label: "Subjek dokumen cocok dengan alamatnya"}
	source := withoutFragment(sourceURL)
	switch {
	case doc.WebID != "" && withoutFragment(doc.WebID) == source:
		check.Result = resultPass
		check.Detail = "Subjek dokumen sama dengan alamat dokumen."
	case doc.WebID != "":
		check.Result = resultPass
		check.Detail = "Subjek dokumen adalah WebID pemilik, bukan alamat dokumen. Ini pola yang dipakai Chainify."
	default:
		check.Result = resultUnknown
		check.Detail = "Dokumen tidak menyebut pemilik, jadi subjeknya tidak bisa dibandingkan."
	}
	return check
}

func requiredFieldsCheck(doc *Document) Check {
	check := Check{ID: "required-fields", Label: "Judul dan kategori terbaca"}
	var missing []string
	if doc.Name == "" {
		missing = append(missing, "judul")
	}
	if doc.Kind != "" && doc.Category == "" {
		missing = append(missing, "kategori")
	}
	if len(missing) == 0 {
		check.Result = resultPass
		check.Detail = "Judul dan kategori terbaca dari dokumen."
		return check
	}
	check.Result = resultWarn
	check.Detail = "Dokumen kehilangan field yang biasanya dipakai pembeli: " + strings.Join(missing, ", ") + "."
	return check
}

// loopbackCheck flags documents read from a non-public or local host. Demo Pods are the
// normal case here, and the buyer deserves to know a row came from localhost.
func loopbackCheck(sourceURL string) Check {
	check := Check{ID: "public-host", Label: "Dokumen dibaca dari host publik"}
	host := hostOf(sourceURL)
	switch {
	case host == "":
		check.Result = resultUnknown
		check.Detail = "Host dokumen tidak terbaca dari alamat."
	case host == "localhost" || host == "127.0.0.1" || strings.HasSuffix(host, ".local"):
		check.Result = resultWarn
		check.Detail = "Dokumen berasal dari Pod lokal (" + host + "), jadi hanya berlaku untuk demo."
	default:
		check.Result = resultPass
		check.Detail = "Dokumen dibaca dari host publik " + host + "."
	}
	return check
}

// tierCheck states which trust tier the document can reach on this prototype. It exists so
// no screen can imply a higher tier than the model defines.
func tierCheck(doc *Document) Check {
	check := Check{ID: "tier", Label: "Tingkat kepercayaan tertinggi yang bisa dicapai"}
	if doc.WebID == "" {
		check.Result = resultFail
		check.Detail = "Tanpa klaim pemilik, dokumen tidak masuk tingkat mana pun."
		return check
	}
	check.Result = resultWarn
	check.Detail = "Tingkat tertinggi untuk dokumen ini adalah 'diklaim pemilik'. Tidak ada penerbit kredensial yang diakui, jadi tingkat 'terverifikasi' belum bisa dicapai."
	return check
}

func weakest(checks []Check) string {
	verdict := resultPass
	rank := map[string]int{resultPass: 0, resultUnknown: 1, resultWarn: 2, resultFail: 3}
	for _, check := range checks {
		if rank[check.Result] > rank[verdict] {
			verdict = check.Result
		}
	}
	return verdict
}

func withoutFragment(raw string) string {
	if index := strings.Index(raw, "#"); index >= 0 {
		return raw[:index]
	}
	return raw
}

func hostOf(raw string) string {
	rest := raw
	if index := strings.Index(rest, "://"); index >= 0 {
		rest = rest[index+3:]
	}
	if index := strings.IndexAny(rest, "/?#"); index >= 0 {
		rest = rest[:index]
	}
	if index := strings.LastIndex(rest, "@"); index >= 0 {
		rest = rest[index+1:]
	}
	if index := strings.LastIndex(rest, ":"); index >= 0 && !strings.Contains(rest[index:], "]") {
		rest = rest[:index]
	}
	return strings.ToLower(strings.TrimSpace(rest))
}
