package identity

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Guard implements the SSRF protection required before any user-supplied URL is fetched.
//
// The rule set, in order:
//  1. Only http and https are accepted.
//  2. Embedded credentials (user:pass@host) are rejected.
//  3. The host must match the configured allowlist, otherwise it is refused outright.
//     Discovery is not an arbitrary URL-fetching service; the allowlist is the boundary.
//  4. Every resolved IP is checked against loopback/private/link-local/multicast ranges
//     unless the host was explicitly allowlisted (the local Community Solid Server case).
//
// Redirects are re-validated per hop by the caller (see Resolver), so a public host
// cannot bounce the request into an internal network.
var (
	// ErrBlockedScheme means the URL used a scheme other than http/https.
	ErrBlockedScheme = errors.New("blocked: unsupported scheme")
	// ErrBlockedCredentials means the URL carried userinfo.
	ErrBlockedCredentials = errors.New("blocked: url must not contain credentials")
	// ErrBlockedHost means the host is not on the fetch allowlist.
	ErrBlockedHost = errors.New("blocked: host is not on the fetch allowlist")
	// ErrBlockedAddress means the host resolved to a non-public address.
	ErrBlockedAddress = errors.New("blocked: host resolves to a non-public address")
	// ErrBlockedPort means the port is outside the allowed set.
	ErrBlockedPort = errors.New("blocked: port is not allowed")
)

// Guard validates outbound URLs against the SSRF policy.
type Guard struct {
	allowlist []string
	resolver  *net.Resolver
}

// NewGuard builds a Guard from host patterns. Patterns beginning with "." match as a
// domain suffix; everything else must match host or host:port exactly.
func NewGuard(allowlist []string) *Guard {
	cleaned := make([]string, 0, len(allowlist))
	for _, entry := range allowlist {
		entry = strings.ToLower(strings.TrimSpace(entry))
		if entry != "" {
			cleaned = append(cleaned, entry)
		}
	}
	return &Guard{allowlist: cleaned, resolver: net.DefaultResolver}
}

// NewTransport builds an http.Transport whose dialer re-applies the guard policy at
// connection time and pins the socket to an approved address.
//
// Pinning closes the DNS-rebinding gap: without it, a host that passes Check can answer
// the guard's lookup with a public address and the transport's lookup with 127.0.0.1.
// Every component that fetches user-supplied URLs should use this transport.
func (g *Guard) NewTransport(timeout time.Duration) *http.Transport {
	dialer := &net.Dialer{Timeout: timeout}
	return &http.Transport{
		MaxIdleConns:        32,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     60 * time.Second,
		TLSClientConfig:     tlsConfig(),
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("dial %s: %w", addr, err)
			}
			ips, err := g.ResolveHost(ctx, host, port)
			if err != nil {
				return nil, err
			}
			var lastErr error
			for _, ip := range ips {
				conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				if err == nil {
					return conn, nil
				}
				lastErr = err
			}
			if lastErr == nil {
				lastErr = fmt.Errorf("dial %s: no usable address", host)
			}
			return nil, lastErr
		},
	}
}

// tlsConfig returns the pool of CAs trusted for Pod fetches.
//
// A local dev provider serves https with a self-signed certificate. Go on Windows
// reads roots from the system store and ignores SSL_CERT_FILE, so the file named by
// CHAINIFY_EXTRA_CA_FILE is loaded explicitly. When the variable is unset the
// returned config uses the system pool, so production behaviour is unchanged.
func tlsConfig() *tls.Config {
	path := strings.TrimSpace(os.Getenv("CHAINIFY_EXTRA_CA_FILE"))
	if path == "" {
		return &tls.Config{MinVersion: tls.VersionTLS12}
	}

	pem, err := os.ReadFile(path)
	if err != nil {
		// Fail loud rather than silently falling back to the system pool: a silent
		// fallback looks like a provider outage instead of a misconfiguration.
		panic(fmt.Sprintf("CHAINIFY_EXTRA_CA_FILE %q: %v", path, err))
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(pem) {
		panic(fmt.Sprintf("CHAINIFY_EXTRA_CA_FILE %q: no PEM certificates found", path))
	}
	return &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: pool}
}

// Check validates raw and returns the parsed URL. It performs DNS resolution, so callers
// should treat it as a network call.
func (g *Guard) Check(ctx context.Context, raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, ErrBlockedScheme
	}
	if parsed.User != nil {
		return nil, ErrBlockedCredentials
	}

	hostname := strings.ToLower(parsed.Hostname())
	if hostname == "" {
		return nil, ErrBlockedHost
	}

	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	if !allowedPort(port) {
		return nil, ErrBlockedPort
	}

	explicit, suffix := g.match(hostname, port)
	if !explicit && !suffix {
		return nil, ErrBlockedHost
	}

	// An explicitly allowlisted host is trusted to live where the operator put it.
	// That is what makes a local Community Solid Server reachable in development.
	if explicit {
		return parsed, nil
	}

	addrs, err := g.resolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", hostname, err)
	}
	if len(addrs) == 0 {
		return nil, ErrBlockedAddress
	}
	for _, addr := range addrs {
		if !g.AllowAddress(hostname, port, addr.IP) {
			return nil, fmt.Errorf("%w (%s)", ErrBlockedAddress, addr.IP)
		}
	}
	return parsed, nil
}

// AllowAddress reports whether ip may be contacted for host:port under this policy.
//
// The HTTP transport calls this at dial time, after DNS has already run, which closes
// the DNS-rebinding gap: a host that passed Check can no longer answer the second
// lookup with a loopback or link-local address and get through.
func (g *Guard) AllowAddress(hostname, port string, ip net.IP) bool {
	hostname = strings.ToLower(hostname)
	explicit, _ := g.match(hostname, port)
	if explicit {
		return true
	}
	return !isNonPublic(ip)
}

// ResolveHost performs the policy-aware lookup used by the transport. It returns the
// addresses that survive AllowAddress, in resolver order.
func (g *Guard) ResolveHost(ctx context.Context, hostname, port string) ([]net.IP, error) {
	addrs, err := g.resolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return nil, err
	}
	out := make([]net.IP, 0, len(addrs))
	for _, addr := range addrs {
		if g.AllowAddress(hostname, port, addr.IP) {
			out = append(out, addr.IP)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("%w: every address for %s is outside the policy", ErrBlockedAddress, hostname)
	}
	return out, nil
}

// match reports whether host:port is explicitly allowlisted, and whether host matches a
// domain-suffix pattern.
func (g *Guard) match(hostname, port string) (explicit, suffix bool) {
	withPort := hostname + ":" + port
	for _, entry := range g.allowlist {
		if strings.HasPrefix(entry, ".") {
			if hostname == entry[1:] || strings.HasSuffix(hostname, entry) {
				suffix = true
			}
			continue
		}
		if entry == withPort || entry == hostname {
			explicit = true
		}
	}
	return explicit, suffix
}

func allowedPort(port string) bool {
	switch port {
	case "80", "443", "3000", "3001", "8080", "8443", "13000", "13001", "13002":
		return true
	default:
		return false
	}
}

// isNonPublic reports whether ip is in a range that must never be reached from an
// allowlisted-domain fetch.
func isNonPublic(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() {
		return true
	}
	// 100.64.0.0/10 carrier-grade NAT and 0.0.0.0/8 are not covered above.
	if v4 := ip.To4(); v4 != nil {
		if v4[0] == 0 {
			return true
		}
		if v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
			return true
		}
	}
	return false
}
