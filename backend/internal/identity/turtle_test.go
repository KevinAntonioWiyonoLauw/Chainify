package identity

import (
	"strings"
	"testing"
)

// CSS emits exactly this shape for a WebID document, so it is the primary fixture.
const cssProfile = `
@prefix : <#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.

:me a foaf:Person ;
    foaf:name "Alice"@en ;
    solid:oidcIssuer <http://localhost:3001/> ;
    pim:storage <http://localhost:3001/alice/> .

<http://localhost:3001/alice/> a pim:Storage .
`

func TestParseTurtleExtractsStorageAndIssuer(t *testing.T) {
	triples, err := ParseTurtle(cssProfile)
	if err != nil {
		t.Fatalf("ParseTurtle returned error: %v", err)
	}

	storage := valuesFor(triples, PimStorage)
	if len(storage) != 1 || storage[0] != "http://localhost:3001/alice/" {
		t.Fatalf("storage = %v, want exactly the alice Pod", storage)
	}

	issuer := firstValueFor(triples, SolidIssuer)
	if issuer != "http://localhost:3001/" {
		t.Fatalf("issuer = %q, want the CSS issuer", issuer)
	}
}

func TestParseTurtleHandlesCommentsAndMultilineLists(t *testing.T) {
	doc := `
# Leading comment
@prefix : <#>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

:me
    # Storage can be repeated; both must survive.
    pim:storage <https://a.example/pod/> ,
                <https://b.example/pod/> ;
    solid:oidcIssuer <https://a.example/> .
`
	triples, err := ParseTurtle(doc)
	if err != nil {
		t.Fatalf("ParseTurtle returned error: %v", err)
	}
	storage := valuesFor(triples, PimStorage)
	if len(storage) != 2 {
		t.Fatalf("storage = %v, want two values", storage)
	}
}

func TestParseTurtleSkipsBlankNodesWithoutDroppingFollowingTriples(t *testing.T) {
	doc := `
@prefix : <#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.

:me foaf:knows [ a foaf:Person ; foaf:name "Bob" ] ;
    pim:storage <https://alice.example/pod/> .
`
	triples, err := ParseTurtle(doc)
	if err != nil {
		t.Fatalf("ParseTurtle returned error: %v", err)
	}
	if got := valuesFor(triples, PimStorage); len(got) != 1 {
		t.Fatalf("storage after blank node = %v, want one value", got)
	}
}

func TestParseTurtleHandlesLongLiteralsAndDatatypes(t *testing.T) {
	doc := `
@prefix : <#>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.

:me :note """Line one
Line two with a "quote" and a <not-an-iri>""" ;
    :count "3"^^<http://www.w3.org/2001/XMLSchema#integer> ;
    pim:storage <https://alice.example/pod/> .
`
	triples, err := ParseTurtle(doc)
	if err != nil {
		t.Fatalf("ParseTurtle returned error: %v", err)
	}
	if got := valuesFor(triples, PimStorage); len(got) != 1 {
		t.Fatalf("storage = %v, want one value", got)
	}
}

// CSS writes a profile's own graph as "<>", a relative IRI with an empty reference.
// The parser once rejected that as an empty subject, so every live CSS profile failed
// with "expected subject at offset".
func TestParseTurtleAcceptsDocumentSelfSubject(t *testing.T) {
	doc := `@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<>
    a foaf:PersonalProfileDocument;
    foaf:maker <https://pod.example/alice/profile/card#me>;
    foaf:primaryTopic <https://pod.example/alice/profile/card#me>.

<https://pod.example/alice/profile/card#me>
    solid:oidcIssuer <https://pod.example/>;
    pim:storage <https://pod.example/alice/>.
`
	triples, err := ParseTurtleWithBase(doc, "https://pod.example/alice/profile/card")
	if err != nil {
		t.Fatalf("ParseTurtleWithBase returned error: %v", err)
	}
	if len(triples) != 5 {
		t.Fatalf("triples = %d, want 5", len(triples))
	}

	// "<>" denotes the document, so it resolves to the document URL rather than "".
	var selfSubjects int
	for _, tr := range triples {
		if tr.Subject == "" {
			t.Fatal("a triple kept an empty subject for \"<>\"")
		}
		if tr.Subject == "https://pod.example/alice/profile/card" {
			selfSubjects++
		}
	}
	if selfSubjects != 3 {
		t.Fatalf("\"<>\" produced %d triples, want 3", selfSubjects)
	}
	if got := valuesFor(triples, PimStorage); len(got) != 1 || got[0] != "https://pod.example/alice/" {
		t.Fatalf("storage = %v, want the declared Pod root", got)
	}
	if got := firstValueFor(triples, SolidIssuer); got != "https://pod.example/" {
		t.Fatalf("issuer = %q, want the declared issuer", got)
	}
}

// Without a document URL there is nothing for "<>" to resolve to. It must still parse
// and must never produce a triple whose subject is the empty string.
func TestParseTurtleSelfSubjectWithoutBaseFallsBackToDocument(t *testing.T) {
	triples, err := ParseTurtleWithBase(`<> <http://www.w3.org/ns/pim/space#storage> <https://pod.example/alice/> .`, "https://pod.example/card")
	if err != nil {
		t.Fatalf("ParseTurtleWithBase returned error: %v", err)
	}
	if len(triples) != 1 || triples[0].Subject != "https://pod.example/card" {
		t.Fatalf("triples = %#v, want the document URL as subject", triples)
	}
}

func TestParseTurtleRejectsUnterminatedIRI(t *testing.T) {
	if _, err := ParseTurtle(`<https://a.example`); err == nil {
		t.Fatal("expected an error for an unterminated IRI, got nil")
	}
}

func TestParseTurtleRejectsUndeclaredPrefix(t *testing.T) {
	_, err := ParseTurtle(`<https://a.example/me> pim:storage <https://a.example/pod/> .`)
	if err == nil {
		t.Fatal("expected an error for an undeclared prefix, got nil")
	}
}

// A profile may carry two declarations: the real issuer, and an issuer registration
// token written against a local development issuer. Both must survive parsing, so the
// node reports the issuer first and the token second.
func TestParseTurtleKeepsIssuerRegistrationToken(t *testing.T) {
	doc := `@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<https://pod.example/profile/card#me>
    solid:oidcIssuer <https://localhost:3000/> .

<https://pod.example/profile/card#me>
    solid:oidcIssuerRegistrationToken "token-value" .
`
	triples, err := ParseTurtleWithBase(doc, "https://pod.example/profile/card")
	if err != nil {
		t.Fatalf("ParseTurtleWithBase returned error: %v", err)
	}
	if got := firstValueFor(triples, SolidIssuer); got != "https://localhost:3000/" {
		t.Fatalf("issuer = %q, want the declared issuer", got)
	}
	if got := firstValueFor(triples, "http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken"); got != "token-value" {
		t.Fatalf("registration token = %q, want token-value", got)
	}
}

// A relative storage pointer must be resolved against the profile document, not handed
// on as-is: `pim:storage </>` is the standard way a provider names the pod root, and a
// bare "/" is not a storage location any client could write to.
func TestParseTurtleResolvesRelativeStorageAgainstDocument(t *testing.T) {
	doc := `@prefix pim: <http://www.w3.org/ns/pim/space#>.

<https://pod.example/profile/card#me>
    pim:storage </> .
`
	triples, err := ParseTurtleWithBase(doc, "https://pod.example/profile/card")
	if err != nil {
		t.Fatalf("ParseTurtleWithBase returned error: %v", err)
	}
	if got := valuesFor(triples, PimStorage); len(got) != 1 || got[0] != "https://pod.example/" {
		t.Fatalf("storage = %v, want the resolved pod root", got)
	}
}

// A profile may declare its namespaces relatively: `@prefix kev: </>.` then
// `space:storage kev:`. Concatenating the two produced "//", a protocol-relative IRI
// naming the host "/", so a real solidcommunity.net profile resolved to storage "/" and
// the app could not write anywhere.
func TestParseTurtleResolvesRelativeNamespacePrefix(t *testing.T) {
	doc := `@prefix kev: </>.
@prefix space: <http://www.w3.org/ns/pim/space#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix : <#>.

<https://pod.example/profile/card#me>
    space:storage kev: ;
    space:preferencesFile </settings/prefs.ttl> ;
    solid:oidcIssuer <https://pod.example/> .

:id a <http://xmlns.com/foaf/0.1/Person> .
`
	triples, err := ParseTurtleWithBase(doc, "https://pod.example/profile/card")
	if err != nil {
		t.Fatalf("ParseTurtleWithBase returned error: %v", err)
	}
	if got := valuesFor(triples, PimStorage); len(got) != 1 || got[0] != "https://pod.example/" {
		t.Fatalf("storage = %v, want https://pod.example/", got)
	}
	if got := valuesFor(triples, PimSpace+"preferencesFile"); len(got) != 1 || got[0] != "https://pod.example/settings/prefs.ttl" {
		t.Fatalf("preferencesFile = %v, want the absolute settings file", got)
	}
	var subject string
	for _, tr := range triples {
		if tr.Subject != "" && strings.HasPrefix(tr.Subject, "https://pod.example/profile/card#id") {
			subject = tr.Subject
		}
	}
	if subject != "https://pod.example/profile/card#id" {
		t.Fatalf("prefixed subject = %q, want it resolved against the document", subject)
	}
}

func TestParseTurtleExpandsRdfTypeShorthand(t *testing.T) {
	triples, err := ParseTurtle(`<https://a.example/pod/> a <http://www.w3.org/ns/pim/space#Storage> .`)
	if err != nil {
		t.Fatalf("ParseTurtle returned error: %v", err)
	}
	if len(triples) != 1 || triples[0].Predicate != RdfType {
		t.Fatalf("triples = %#v, want a single rdf:type triple", triples)
	}
}

func TestValuesForIsSortedAndDeduplicated(t *testing.T) {
	triples := []Triple{
		{Subject: "s", Predicate: PimStorage, Object: "https://b.example/pod/"},
		{Subject: "s", Predicate: PimStorage, Object: "https://a.example/pod/"},
		{Subject: "s", Predicate: PimStorage, Object: "https://a.example/pod/"},
	}
	got := valuesFor(triples, PimStorage)
	if len(got) != 2 {
		t.Fatalf("valuesFor = %v, want two unique values", got)
	}
	if got[0] != "https://a.example/pod/" || got[1] != "https://b.example/pod/" {
		t.Fatalf("valuesFor = %v, want sorted order", got)
	}
}

func TestNormalizeIRI(t *testing.T) {
	cases := []struct{ in, want string }{
		{"  https://a.example/pod/  ", "https://a.example/pod/"},
		{"https://a.example", "https://a.example/"},
		{"https://a.example/pod", "https://a.example/pod"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := normalizeIRI(tc.in); got != tc.want {
			t.Errorf("normalizeIRI(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestParseJSONLDHandlesGraphAndIdObjects(t *testing.T) {
	doc := `{
	  "@context": {"pim": "http://www.w3.org/ns/pim/space#"},
	  "@graph": [
	    {
	      "@id": "https://a.example/profile/card#me",
	      "http://www.w3.org/ns/pim/space#storage": [
	        {"@id": "https://a.example/pod/"}
	      ],
	      "http://www.w3.org/ns/solid/terms#oidcIssuer": {"@id": "https://a.example/"}
	    }
	  ]
	}`
	triples, err := ParseJSONLD([]byte(doc))
	if err != nil {
		t.Fatalf("ParseJSONLD returned error: %v", err)
	}
	storage := valuesFor(triples, PimStorage)
	if len(storage) != 1 || storage[0] != "https://a.example/pod/" {
		t.Fatalf("storage = %v, want the Pod URL", storage)
	}
	if issuer := firstValueFor(triples, SolidIssuer); issuer != "https://a.example/" {
		t.Fatalf("issuer = %q, want https://a.example/", issuer)
	}
}

func TestParseJSONLDSkipsNodesWithoutId(t *testing.T) {
	doc := `{"@graph":[{"http://www.w3.org/ns/pim/space#storage":{"@id":"https://a.example/pod/"}}]}`
	triples, err := ParseJSONLD([]byte(doc))
	if err != nil {
		t.Fatalf("ParseJSONLD returned error: %v", err)
	}
	if len(triples) != 0 {
		t.Fatalf("triples = %#v, want none for an anonymous node", triples)
	}
}

func TestParseJSONLDRejectsInvalidJSON(t *testing.T) {
	if _, err := ParseJSONLD([]byte("{not json")); err == nil {
		t.Fatal("expected an error for invalid JSON")
	}
}

// A regression guard: extraction must tolerate a provider labelling Turtle as JSON.
func TestExtractFallsBackBetweenFormats(t *testing.T) {
	r := &Resolver{}
	triples, err := r.extract([]byte(cssProfile), "application/json", "https://pod.example/alice/profile/card")
	if err != nil {
		t.Fatalf("extract returned error for Turtle labelled as JSON: %v", err)
	}
	if got := valuesFor(triples, PimStorage); len(got) != 1 {
		t.Fatalf("storage = %v, want one value after fallback", got)
	}
}

func TestStatusReasonMapping(t *testing.T) {
	cases := map[int]string{
		404: "webid_not_found",
		403: "webid_forbidden",
		401: "webid_requires_auth",
		429: "rate_limited",
		503: "pod_error",
		200: "unexpected_status",
	}
	for code, want := range cases {
		if got := statusReason(code); got != want {
			t.Errorf("statusReason(%d) = %q, want %q", code, got, want)
		}
	}
}

func TestWellKnownVocabularyIRIs(t *testing.T) {
	if !strings.HasSuffix(PimStorage, "space#storage") {
		t.Errorf("PimStorage = %q, want the pim storage predicate", PimStorage)
	}
	if !strings.HasSuffix(SolidIssuer, "terms#oidcIssuer") {
		t.Errorf("SolidIssuer = %q, want the Solid OIDC issuer predicate", SolidIssuer)
	}
	if !strings.HasSuffix(RdfType, "rdf-syntax-ns#type") {
		t.Errorf("RdfType = %q, want rdf:type", RdfType)
	}
}
