package identity

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ParseJSONLD extracts triples from a JSON-LD document.
//
// Keys are expanded through @context before they become predicates. A Pod that emits
// "name" under {"@vocab": "https://schema.org/"} otherwise produces a raw "name"
// predicate, which no vocabulary term can ever match.
func ParseJSONLD(doc []byte) ([]Triple, error) {
	var root any
	if err := json.Unmarshal(doc, &root); err != nil {
		return nil, fmt.Errorf("json-ld: %w", err)
	}

	var out []Triple
	walkNodes(root, ldScope{}, &out)
	return out, nil
}

// ldScope is the subset of a JSON-LD context this reader expands: a default vocabulary
// plus per-term overrides and prefixes. Nested contexts merge onto the parent, so a
// document can set one vocabulary at the top and override a single term below.
type ldScope struct {
	vocab    map[string]string
	prefixes map[string]string
	base     string
}

func newScope() ldScope {
	return ldScope{vocab: map[string]string{}, prefixes: map[string]string{}}
}

func (s ldScope) predicate(key string) string {
	if expanded, ok := s.vocab[key]; ok {
		return expanded
	}
	if index := strings.Index(key, ":"); index > 0 {
		if base, ok := s.prefixes[key[:index]]; ok {
			return base + key[index+1:]
		}
		if strings.HasPrefix(key[index+1:], "//") {
			return key
		}
	}
	if defaultVocab, ok := s.vocab[""]; ok {
		return defaultVocab + key
	}
	return key
}

func (s ldScope) resolveId(id string) string {
	if id == "" || s.base == "" {
		return id
	}
	if strings.HasPrefix(id, "#") {
		return s.base + id
	}
	if strings.Contains(id, "://") || strings.HasPrefix(id, "urn:") || strings.HasPrefix(id, "mailto:") {
		return id
	}
	return s.base + id
}

// with merges a child context onto the receiver without mutating it.
func (s ldScope) with(raw any) ldScope {
	next := newScope()
	next.base = s.base
	for key, value := range s.vocab {
		next.vocab[key] = value
	}
	for key, value := range s.prefixes {
		next.prefixes[key] = value
	}

	switch typed := raw.(type) {
	case []any:
		for _, item := range typed {
			next = next.with(item)
		}
	case map[string]any:
		if base, ok := typed["@base"].(string); ok {
			next.base = base
		}
		if vocab, ok := typed["@vocab"].(string); ok {
			next.vocab[""] = vocab
		}
		for key, value := range typed {
			if strings.HasPrefix(key, "@") {
				continue
			}
			mapping, ok := value.(string)
			if !ok {
				// A term may map to {"@id": ...}; read that shape too.
				if nested, ok := value.(map[string]any); ok {
					if id, ok := nested["@id"].(string); ok {
						next.vocab[key] = id
						if strings.HasSuffix(id, "/") || strings.HasSuffix(id, "#") {
							next.prefixes[key] = id
						}
					}
				}
				continue
			}
			next.vocab[key] = mapping
			if strings.HasSuffix(mapping, "/") || strings.HasSuffix(mapping, "#") {
				next.prefixes[key] = mapping
			}
		}
	}
	return next
}

func walkNodes(node any, scope ldScope, out *[]Triple) {
	switch typed := node.(type) {
	case []any:
		for _, item := range typed {
			walkNodes(item, scope, out)
		}
	case map[string]any:
		local := scope
		if raw, ok := typed["@context"]; ok {
			local = scope.with(raw)
		}
		if graph, ok := typed["@graph"]; ok {
			walkNodes(graph, local, out)
		}
		subject := local.resolveId(asString(typed["@id"]))
		if subject == "" {
			return
		}
		for key, value := range typed {
			if strings.HasPrefix(key, "@") {
				continue
			}
			collectObjects(subject, local.predicate(key), value, local, out)
		}
	}
}

func collectObjects(subject, predicate string, value any, scope ldScope, out *[]Triple) {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			collectObjects(subject, predicate, item, scope, out)
		}
	case map[string]any:
		if id := asString(typed["@id"]); id != "" {
			*out = append(*out, Triple{Subject: subject, Predicate: predicate, Object: scope.resolveId(id)})
			// A nested node can carry its own fields, so read it as a node of its own.
			walkNodes(typed, scope, out)
			return
		}
		if literal, ok := typed["@value"]; ok {
			*out = append(*out, Triple{
				Subject:   subject,
				Predicate: predicate,
				Object:    asString(literal),
				Literal:   true,
			})
			return
		}
		// A nested node without @id is a blank node: its fields still need reading, and the
		// subject stays the parent so a reader can group them.
		for key, child := range typed {
			if strings.HasPrefix(key, "@") {
				continue
			}
			collectObjects(subject, scope.predicate(key), child, scope, out)
		}
	case string:
		*out = append(*out, Triple{Subject: subject, Predicate: predicate, Object: typed, Literal: true})
	case float64, bool:
		*out = append(*out, Triple{
			Subject:   subject,
			Predicate: predicate,
			Object:    fmt.Sprint(typed),
			Literal:   true,
		})
	}
}

func asString(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}
