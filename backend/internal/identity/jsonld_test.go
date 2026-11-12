package identity

import "testing"

// Regression: keys used to be kept raw, so {"@vocab": "https://schema.org/"} produced a
// predicate of "name" and no vocabulary term ever matched it.
func TestParseJSONLDExpandsVocabKeys(t *testing.T) {
	doc := []byte(`{
      "@context": {"@vocab": "https://schema.org/", "cfy": "https://chainify.local/ns#"},
      "@id": "https://a.example/l/1.jsonld",
      "@type": "Offer",
      "name": "Kopi Arabika",
      "cfy:kind": "offer",
      "cfy:ownerWebId": {"@id": "https://a.example/profile/card#me"}
    }`)

	triples, err := ParseJSONLD(doc)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	byPredicate := map[string]Triple{}
	for _, triple := range triples {
		byPredicate[triple.Predicate] = triple
	}

	name, ok := byPredicate["https://schema.org/name"]
	if !ok || name.Object != "Kopi Arabika" || !name.Literal {
		t.Fatalf("name triple = %+v, want an expanded schema:name literal", name)
	}
	kind, ok := byPredicate["https://chainify.local/ns#kind"]
	if !ok || kind.Object != "offer" {
		t.Fatalf("kind triple = %+v, want an expanded cfy:kind literal", kind)
	}
	owner, ok := byPredicate["https://chainify.local/ns#ownerWebId"]
	if !ok || owner.Literal {
		t.Fatalf("owner triple = %+v, want an IRI object", owner)
	}
	if owner.Object != "https://a.example/profile/card#me" {
		t.Fatalf("owner object = %q", owner.Object)
	}
}

func TestParseJSONLDReadsNestedItemSubjects(t *testing.T) {
	doc := []byte(`{
      "@context": {"@vocab": "https://schema.org/"},
      "@id": "https://a.example/index.jsonld",
      "name": "Koperasi",
      "hasOfferCatalog": {
        "@type": "OfferCatalog",
        "itemListElement": [
          {"@id": "https://a.example/l/1.jsonld", "name": "Kopi"}
        ]
      }
    }`)

	triples, err := ParseJSONLD(doc)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	var itemNames int
	for _, triple := range triples {
		if triple.Subject == "https://a.example/l/1.jsonld" && triple.Object == "Kopi" {
			itemNames++
		}
	}
	if itemNames != 1 {
		t.Fatalf("item name triples = %d, want 1 under the item's own subject", itemNames)
	}
}

func TestParseJSONLDKeepsAbsoluteAndPrefixedTerms(t *testing.T) {
	doc := []byte(`{
      "@context": {"schema": "https://schema.org/"},
      "@id": "https://a.example/x",
      "schema:name": "Kopi",
      "http://purl.org/dc/terms/title": "Judul"
    }`)

	triples, err := ParseJSONLD(doc)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	seen := map[string]bool{}
	for _, triple := range triples {
		seen[triple.Predicate] = true
	}
	if !seen["https://schema.org/name"] {
		t.Error("prefixed term was not expanded")
	}
	if !seen["http://purl.org/dc/terms/title"] {
		t.Error("absolute term was rewritten")
	}
}
