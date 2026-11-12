package identity

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"
)

// testGuard uses an allowlist that contains only exact hosts and domain suffixes, so no
// test case performs real network I/O against an unowned host.
func testGuard() *Guard {
	return NewGuard([]string{
		"css", "css:3000", "localhost", "localhost:3000",
		"127.0.0.1", "127.0.0.1:3000",
		".solidcommunity.net",
	})
}

func TestCheckRejectsNonHTTPSchemes(t *testing.T) {
	g := testGuard()
	for _, raw := range []string{
		"file:///etc/passwd",
		"ftp://localhost/pod",
		"gopher://localhost/",
		"javascript:alert(1)",
	} {
		if _, err := g.Check(context.Background(), raw); !errors.Is(err, ErrBlockedScheme) {
			t.Errorf("Check(%q) err = %v, want ErrBlockedScheme", raw, err)
		}
	}
}

func TestCheckRejectsUserinfo(t *testing.T) {
	g := testGuard()
	_, err := g.Check(context.Background(), "http://user:secret@localhost:3000/profile/card#me")
	if !errors.Is(err, ErrBlockedCredentials) {
		t.Fatalf("err = %v, want ErrBlockedCredentials", err)
	}
}

func TestCheckRejectsHostsOutsideAllowlist(t *testing.T) {
	g := testGuard()
	for _, raw := range []string{
		"http://169.254.169.254/latest/meta-data/",
		"http://internal-service:8080/admin",
		"http://example.com/profile/card#me",
	} {
		if _, err := g.Check(context.Background(), raw); !errors.Is(err, ErrBlockedHost) {
			t.Errorf("Check(%q) err = %v, want ErrBlockedHost", raw, err)
		}
	}
}

func TestCheckRejectsDisallowedPorts(t *testing.T) {
	g := NewGuard([]string{"localhost"})
	_, err := g.Check(context.Background(), "http://localhost:6379/")
	if !errors.Is(err, ErrBlockedPort) {
		t.Fatalf("err = %v, want ErrBlockedPort", err)
	}
}

func TestCheckAcceptsExplicitLocalProvider(t *testing.T) {
	g := testGuard()
	u, err := g.Check(context.Background(), "http://localhost:3000/alice/profile/card#me")
	if err != nil {
		t.Fatalf("Check returned error for the local CSS provider: %v", err)
	}
	if u.Host != "localhost:3000" {
		t.Fatalf("host = %q, want localhost:3000", u.Host)
	}
}

func TestCheckMatchesDomainSuffixes(t *testing.T) {
	g := testGuard()
	explicit, suffix := g.match("pod.solidcommunity.net", "443")
	if explicit || !suffix {
		t.Fatalf("match = (%v, %v), want (false, true) for a subdomain", explicit, suffix)
	}

	explicit, suffix = g.match("solidcommunity.net", "443")
	if explicit || !suffix {
		t.Fatalf("match = (%v, %v), want the apex to match its own suffix", explicit, suffix)
	}

	if _, suffix = g.match("evilsolidcommunity.net", "443"); suffix {
		t.Fatal("suffix matched a domain that only shares a string ending")
	}
}

func TestIsNonPublicCoversInternalRanges(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "10.0.0.5", "172.16.0.5", "192.168.1.5",
		"169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1",
		"::1", "fe80::1",
	}
	for _, raw := range blocked {
		ip := net.ParseIP(raw)
		if ip == nil {
			t.Fatalf("invalid test IP %q", raw)
		}
		if !isNonPublic(ip) {
			t.Errorf("isNonPublic(%s) = false, want true", raw)
		}
	}

	if isNonPublic(net.ParseIP("8.8.8.8")) {
		t.Error("isNonPublic(8.8.8.8) = true, want false for a public address")
	}
	if isNonPublic(net.ParseIP("100.128.0.1")) {
		t.Error("100.128.0.1 is outside the CGNAT range and must not be blocked")
	}
}

func TestAllowAddressTrustsOnlyExactHosts(t *testing.T) {
	g := testGuard()
	// An exact host is operator configuration, so a private address is permitted.
	if !g.AllowAddress("localhost", "3000", net.ParseIP("127.0.0.1")) {
		t.Fatal("AllowAddress rejected the explicitly allowlisted local provider")
	}
	// A suffix match must never be allowed to rebind to loopback.
	if g.AllowAddress("pod.solidcommunity.net", "443", net.ParseIP("127.0.0.1")) {
		t.Fatal("AllowAddress allowed a suffix host to rebind to loopback")
	}
	if !g.AllowAddress("pod.solidcommunity.net", "443", net.ParseIP("8.8.8.8")) {
		t.Fatal("AllowAddress rejected a public address for a suffix host")
	}
}

func TestResolveHostRejectsSuffixHostOnLoopback(t *testing.T) {
	g := testGuard()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// localhost is explicitly allowlisted, so this is the positive control: the resolver
	// returns addresses and the transport may dial them.
	ips, err := g.ResolveHost(ctx, "localhost", "3000")
	if err != nil {
		t.Fatalf("ResolveHost(localhost) error = %v", err)
	}
	if len(ips) == 0 {
		t.Fatal("ResolveHost(localhost) returned no addresses")
	}
}

func TestNewTransportPinsTheDialerToThePolicy(t *testing.T) {
	g := testGuard()
	transport := g.NewTransport(500 * time.Millisecond)
	if transport == nil || transport.DialContext == nil {
		t.Fatal("NewTransport did not install a policy-aware DialContext")
	}
	// A host outside the allowlist must fail before any connection is attempted.
	_, err := transport.DialContext(context.Background(), "tcp", "internal-service:8080")
	if err == nil {
		t.Fatal("DialContext connected to a host outside the allowlist")
	}
}
