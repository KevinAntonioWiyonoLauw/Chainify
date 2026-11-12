package identity

import (
	"fmt"
	"net/url"
	"strings"
	"unicode"
)

// Triple is one RDF statement extracted from a profile document. Literals keep their
// lexical form only; Chainify does not need datatypes to read a storage pointer.
type Triple struct {
	Subject   string
	Predicate string
	Object    string
	Literal   bool
}

// Well-known vocabularies used by Solid WebID profiles.
const (
	PimStorage    = "http://www.w3.org/ns/pim/space#storage"
	PimSpace      = "http://www.w3.org/ns/pim/space#"
	SolidIssuer   = "http://www.w3.org/ns/solid/terms#oidcIssuer"
	RdfType       = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
	FoafPrimary   = "http://xmlns.com/foaf/0.1/primaryTopic"
	SolidWebID    = "http://www.w3.org/ns/solid/terms#webid"
	DefaultPrefix = "http://xmlns.com/foaf/0.1/"
)

// ParseTurtle reads a Turtle document and returns its top-level triples.
//
// It is deliberately small: it understands prefixes, base, IRIs, prefixed names,
// literals (including language tags and datatypes), predicate/object lists, and it
// skips blank-node bodies and collections because a WebID profile never needs them
// to locate a Pod. Anything it cannot parse is reported rather than guessed at.
func ParseTurtle(doc string) ([]Triple, error) {
	return ParseTurtleWithBase(doc, "")
}

// ParseTurtleWithBase is ParseTurtle with the document's own URL as the base IRI.
//
// A WebID profile normally writes its graph as "<>", a relative reference to the
// document itself. Without the document URL those statements cannot be resolved to
// anything, and the very subject that names the profile is lost.
func ParseTurtleWithBase(doc, documentURL string) ([]Triple, error) {
	// Prefixes are document-scoped: accepting undeclared well-known prefixes would
	// silently change the meaning of malformed or untrusted profile documents.
	p := &turtleParser{
		src:      doc,
		prefixes: map[string]string{},
		base:     strings.TrimSpace(documentURL),
	}
	return p.parse()
}

type turtleParser struct {
	src      string
	pos      int
	prefixes map[string]string
	base     string
	triples  []Triple
}

// anonymousSubject marks a statement whose subject is a blank node or collection. It is
// an internal sentinel, so it can never collide with a real IRI, which always has a scheme.
const anonymousSubject = "\x00blank"

func (p *turtleParser) parse() ([]Triple, error) {
	for {
		p.skipSpace()
		if p.eof() {
			return p.triples, nil
		}
		if p.atDirective() {
			if err := p.readDirective(); err != nil {
				return nil, err
			}
			continue
		}
		subject, err := p.readTerm()
		if err != nil {
			return nil, err
		}
		if subject == "" {
			return nil, fmt.Errorf("turtle: expected subject at offset %d", p.pos)
		}
		// "[]" and "()" open a blank-node or collection body whose triples this parser
		// does not model. The subject is unknown, not empty, so the statement is
		// skipped without being mistaken for a malformed subject.
		if subject == anonymousSubject {
			p.skipStatement()
			continue
		}
		if err := p.readPredicateObjectList(subject); err != nil {
			return nil, err
		}
		p.skipSpace()
		if !p.eof() && p.peek() == '.' {
			p.pos++
		}
	}
}

// readPredicateObjectList consumes "pred obj (, obj)* (; pred obj...)*" up to the
// statement-terminating dot, which the caller consumes.
func (p *turtleParser) readPredicateObjectList(subject string) error {
	for {
		p.skipSpace()
		if p.eof() {
			return fmt.Errorf("turtle: unexpected end of document")
		}
		switch p.peek() {
		case '.':
			return nil
		case ';':
			p.pos++
			continue
		}

		predicate, err := p.readTerm()
		if err != nil {
			return err
		}
		if predicate == "" {
			return fmt.Errorf("turtle: expected predicate at offset %d", p.pos)
		}

		for {
			p.skipSpace()
			object, literal, err := p.readObject()
			if err != nil {
				return err
			}
			p.triples = append(p.triples, Triple{
				Subject:   subject,
				Predicate: predicate,
				Object:    object,
				Literal:   literal,
			})

			p.skipSpace()
			if !p.eof() && p.peek() == ',' {
				p.pos++
				continue
			}
			break
		}
	}
}

// skipStatement consumes the predicate-object list of a statement whose subject this
// parser does not model, stopping after the terminating dot.
func (p *turtleParser) skipStatement() {
	depth := 0
	for !p.eof() {
		switch p.peek() {
		case '[', '(':
			depth++
			p.pos++
			continue
		case ']', ')':
			if depth > 0 {
				depth--
			}
			p.pos++
			continue
		case '"', '\'':
			_, _ = p.readLiteral()
			continue
		case '<':
			if _, err := p.readIRI(); err != nil {
				return
			}
			continue
		case '.':
			if depth == 0 {
				p.pos++
				return
			}
		}
		p.pos++
	}
}

func (p *turtleParser) atDirective() bool {
	if p.peek() == '@' {
		return true
	}
	rest := p.src[p.pos:]
	for _, kw := range []string{"PREFIX", "BASE"} {
		if len(rest) >= len(kw) && strings.EqualFold(rest[:len(kw)], kw) {
			after := len(kw)
			if len(rest) > after && unicode.IsSpace(rune(rest[after])) {
				return true
			}
		}
	}
	return false
}

func (p *turtleParser) readDirective() error {
	if p.peek() == '@' {
		p.pos++
		word := p.readWord()
		switch strings.ToLower(word) {
		case "prefix":
			if err := p.readPrefix(); err != nil {
				return err
			}
			return p.finishLegacyDirective()
		case "base":
			p.skipSpace()
			iri, err := p.readIRI()
			if err != nil {
				return err
			}
			p.base = iri
			return p.finishLegacyDirective()
		default:
			return fmt.Errorf("turtle: unknown directive @%s", word)
		}
	}
	word := strings.ToUpper(p.readWord())
	switch word {
	case "PREFIX":
		return p.readPrefix()
	case "BASE":
		p.skipSpace()
		iri, err := p.readIRI()
		if err != nil {
			return err
		}
		p.base = iri
		return nil
	default:
		return fmt.Errorf("turtle: unknown directive %s", word)
	}
}

func (p *turtleParser) readPrefix() error {
	p.skipSpace()
	name := p.readWord()
	if !strings.HasSuffix(name, ":") {
		return fmt.Errorf("turtle: malformed prefix name %q", name)
	}
	p.skipSpace()
	iri, err := p.readIRI()
	if err != nil {
		return err
	}
	p.prefixes[strings.TrimSuffix(name, ":")] = iri
	return nil
}

// finishLegacyDirective consumes the mandatory dot in @prefix/@base. The SPARQL-style
// PREFIX/BASE forms intentionally have no statement terminator.
func (p *turtleParser) finishLegacyDirective() error {
	p.skipSpace()
	if p.eof() || p.peek() != '.' {
		return fmt.Errorf("turtle: expected directive terminator at offset %d", p.pos)
	}
	p.pos++
	return nil
}

// readTerm reads a subject or predicate. It returns anonymousSubject for a blank node
// or collection, neither of which this parser models as a named subject.
func (p *turtleParser) readTerm() (string, error) {
	p.skipSpace()
	if p.eof() {
		return "", fmt.Errorf("turtle: unexpected end of document")
	}
	switch p.peek() {
	case '<':
		iri, err := p.readIRI()
		if err != nil {
			return "", err
		}
		return p.resolve(iri), nil
	case '[':
		return anonymousSubject, p.skipBlankNode()
	case '(':
		return anonymousSubject, p.skipCollection()
	case '"', '\'':
		// A literal in subject position is invalid Turtle; surface it.
		return "", fmt.Errorf("turtle: literal used as subject at offset %d", p.pos)
	}

	name := p.readWord()
	if name == "" {
		return "", fmt.Errorf("turtle: expected term at offset %d", p.pos)
	}
	if name == "a" {
		return RdfType, nil
	}
	return p.expand(name)
}

// readObject reads an object term and reports whether it was a literal.
func (p *turtleParser) readObject() (string, bool, error) {
	p.skipSpace()
	if p.eof() {
		return "", false, fmt.Errorf("turtle: unexpected end of document")
	}
	switch p.peek() {
	case '<':
		iri, err := p.readIRI()
		if err != nil {
			return "", false, err
		}
		// "<>" is a relative IRI with an empty reference: it denotes the document
		// itself, which is the usual subject of a WebID profile. Returning "" would
		// make the caller treat the object as missing.
		return p.resolve(iri), false, nil
	case '[':
		return "", false, p.skipBlankNode()
	case '(':
		return "", false, p.skipCollection()
	case '"', '\'':
		value, err := p.readLiteral()
		return value, true, err
	}

	name := p.readWord()
	if name == "" {
		return "", false, fmt.Errorf("turtle: expected object at offset %d", p.pos)
	}
	if strings.HasPrefix(name, "_:") {
		return name, false, nil
	}
	expanded, err := p.expand(name)
	if err != nil {
		// A bare word that is not a prefixed name is a boolean or number literal.
		return name, true, nil
	}
	return expanded, false, nil
}

func (p *turtleParser) expand(name string) (string, error) {
	idx := strings.Index(name, ":")
	if idx < 0 {
		return "", fmt.Errorf("turtle: %q is not a prefixed name", name)
	}
	prefix := name[:idx]
	local := name[idx+1:]
	ns, ok := p.prefixes[prefix]
	if !ok {
		return "", fmt.Errorf("turtle: undeclared prefix %q", prefix)
	}
	// A local name opening with a slash is a path relative to the namespace IRI or, for
	// a namespace declared with a relative IRI such as `@prefix kev: </>.`, relative to
	// the document. Concatenating the two would yield "//" — a protocol-relative IRI that
	// names a host ("/"), not a path, which is how a profile declaring `space:storage
	// kev:` was read back as the unusable storage location "/".
	if strings.HasPrefix(local, "/") {
		joined := strings.TrimSuffix(ns, "/") + local
		uri, err := url.Parse(joined)
		if err != nil || uri.IsAbs() {
			return joined, nil
		}
		return p.absolute(joined), nil
	}
	return p.resolve(ns + local), nil
}

// absolute makes a reference absolute against the document IRI, or returns it as-is
// when it already is one. Prefix expansion and predicate lookup need this; "<>"
// resolution does not, which is why it stays out of resolve.
func (p *turtleParser) absolute(iri string) string {
	if p.base == "" {
		return iri
	}
	ref, err := url.Parse(iri)
	if err != nil || ref.IsAbs() {
		return iri
	}
	base, err := url.Parse(p.base)
	if err != nil {
		return iri
	}
	return base.ResolveReference(ref).String()
}

func (p *turtleParser) resolve(iri string) string {
	// An empty IRI (written "<>") is a relative reference to the document itself. It is
	// how a WebID profile names its own graph, so it must resolve to the document URL
	// even when the document declares no @base of its own.
	if iri == "" {
		return p.base
	}
	if p.base == "" {
		return iri
	}
	ref, err := url.Parse(iri)
	if err != nil || ref.IsAbs() {
		return iri
	}
	base, err := url.Parse(p.base)
	if err != nil {
		return iri
	}
	return base.ResolveReference(ref).String()
}

func (p *turtleParser) readIRI() (string, error) {
	if p.peek() != '<' {
		return "", fmt.Errorf("turtle: expected IRI at offset %d", p.pos)
	}
	p.pos++
	start := p.pos
	var b strings.Builder
	for !p.eof() {
		ch := p.src[p.pos]
		if ch == '\\' && p.pos+1 < len(p.src) {
			b.WriteString(p.src[start:p.pos])
			p.pos++
			b.WriteByte(p.src[p.pos])
			p.pos++
			start = p.pos
			continue
		}
		if ch == '>' {
			b.WriteString(p.src[start:p.pos])
			p.pos++
			return b.String(), nil
		}
		p.pos++
	}
	return "", fmt.Errorf("turtle: unterminated IRI")
}

func (p *turtleParser) readLiteral() (string, error) {
	quote := p.peek()
	long := strings.HasPrefix(p.src[p.pos:], strings.Repeat(string(quote), 3))
	delim := string(quote)
	if long {
		delim = strings.Repeat(string(quote), 3)
	}
	p.pos += len(delim)

	var b strings.Builder
	for !p.eof() {
		if strings.HasPrefix(p.src[p.pos:], delim) {
			p.pos += len(delim)
			p.consumeLiteralSuffix()
			return b.String(), nil
		}
		ch := p.src[p.pos]
		if ch == '\\' && p.pos+1 < len(p.src) {
			p.pos++
			switch p.src[p.pos] {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			case 'r':
				b.WriteByte('\r')
			default:
				b.WriteByte(p.src[p.pos])
			}
			p.pos++
			continue
		}
		b.WriteByte(ch)
		p.pos++
	}
	return "", fmt.Errorf("turtle: unterminated literal")
}

// consumeLiteralSuffix skips an optional language tag or datatype.
func (p *turtleParser) consumeLiteralSuffix() {
	if p.eof() {
		return
	}
	if p.peek() == '@' {
		p.pos++
		p.readWord()
		return
	}
	if strings.HasPrefix(p.src[p.pos:], "^^") {
		p.pos += 2
		if !p.eof() && p.peek() == '<' {
			_, _ = p.readIRI()
			return
		}
		p.readWord()
	}
}

func (p *turtleParser) skipBlankNode() error {
	depth := 0
	for !p.eof() {
		switch p.peek() {
		case '[':
			depth++
			p.pos++
		case ']':
			depth--
			p.pos++
			if depth == 0 {
				return nil
			}
		case '<':
			if _, err := p.readIRI(); err != nil {
				return err
			}
		case '"', '\'':
			if _, err := p.readLiteral(); err != nil {
				return err
			}
		default:
			p.pos++
		}
	}
	return fmt.Errorf("turtle: unterminated blank node")
}

func (p *turtleParser) skipCollection() error {
	depth := 0
	for !p.eof() {
		switch p.peek() {
		case '(':
			depth++
			p.pos++
		case ')':
			depth--
			p.pos++
			if depth == 0 {
				return nil
			}
		case '<':
			if _, err := p.readIRI(); err != nil {
				return err
			}
		case '"', '\'':
			if _, err := p.readLiteral(); err != nil {
				return err
			}
		default:
			p.pos++
		}
	}
	return fmt.Errorf("turtle: unterminated collection")
}

func (p *turtleParser) readWord() string {
	start := p.pos
	for !p.eof() {
		ch := p.src[p.pos]
		if unicode.IsSpace(rune(ch)) || strings.ContainsRune(";,[]()<>\"'", rune(ch)) {
			break
		}
		if ch == '.' {
			// A dot is a statement terminator unless it is part of a token, as in a
			// decimal literal (1.5) or a prefixed local name (ns:a.b). Checking the next
			// character keeps `pim:storage <x>.` from swallowing the terminator.
			if p.pos+1 >= len(p.src) || unicode.IsSpace(rune(p.src[p.pos+1])) ||
				strings.ContainsRune(";,[]()<>\"'", rune(p.src[p.pos+1])) {
				break
			}
		}
		p.pos++
	}
	return p.src[start:p.pos]
}

func (p *turtleParser) skipSpace() {
	for !p.eof() {
		ch := p.src[p.pos]
		if unicode.IsSpace(rune(ch)) {
			p.pos++
			continue
		}
		if ch == '#' {
			for !p.eof() && p.src[p.pos] != '\n' {
				p.pos++
			}
			continue
		}
		return
	}
}

func (p *turtleParser) eof() bool { return p.pos >= len(p.src) }

func (p *turtleParser) peek() byte {
	if p.eof() {
		return 0
	}
	return p.src[p.pos]
}
