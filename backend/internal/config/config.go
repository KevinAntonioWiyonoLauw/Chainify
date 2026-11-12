// Package config loads the Chainify API service configuration from the environment.
//
// Only non-secret values live here. The service is stateless: it holds no session
// tokens, no Pod data, and no business catalog. Everything it needs arrives per request.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the resolved runtime configuration for the API service.
type Config struct {
	// Addr is the listen address, e.g. ":8080".
	Addr string

	// AllowedOrigins is the browser origin allowlist for CORS. Never "*" in production.
	AllowedOrigins []string

	// FetchAllowlist holds host patterns the WebID resolver may reach.
	// Entries beginning with "." match as a domain suffix (".solidcommunity.net").
	// Any other entry must match host, or host:port, exactly ("css:3000").
	FetchAllowlist []string

	// CSSIssuerURL is the local Community Solid Server issuer, surfaced by /api/meta.
	CSSIssuerURL string

	// FetchTimeout bounds a single outbound WebID fetch.
	FetchTimeout time.Duration

	// MaxProfileBytes caps how much of a remote profile document is read.
	MaxProfileBytes int64

	// LogLevel is "debug", "info", or "error".
	LogLevel string
}

// Load reads configuration from the environment and validates it.
func Load() (Config, error) {
	cfg := Config{
		Addr:            ":" + envOr("API_PORT", "13001"),
		AllowedOrigins:  splitList(envOr("ALLOWED_ORIGINS", "http://localhost:13000")),
		FetchAllowlist:  splitList(envOr("WEBID_FETCH_ALLOWLIST", "css,localhost,css:3000,localhost:13002,.solidcommunity.net,.inrupt.net,.solidweb.org")),
		CSSIssuerURL:    envOr("CSS_ISSUER_URL", "https://localhost:13002/"),
		FetchTimeout:    time.Duration(envInt("FETCH_TIMEOUT_MS", 8000)) * time.Millisecond,
		MaxProfileBytes: int64(envInt("MAX_PROFILE_BYTES", 1<<20)),
		LogLevel:        strings.ToLower(envOr("LOG_LEVEL", "info")),
	}

	if len(cfg.AllowedOrigins) == 0 {
		return Config{}, fmt.Errorf("ALLOWED_ORIGINS must list at least one origin")
	}
	for _, origin := range cfg.AllowedOrigins {
		if origin == "*" {
			return Config{}, fmt.Errorf("ALLOWED_ORIGINS must not be '*': the API reflects credentials-bearing origins")
		}
	}
	if len(cfg.FetchAllowlist) == 0 {
		return Config{}, fmt.Errorf("WEBID_FETCH_ALLOWLIST must list at least one host pattern")
	}
	if cfg.FetchTimeout <= 0 {
		return Config{}, fmt.Errorf("FETCH_TIMEOUT_MS must be positive")
	}
	if cfg.MaxProfileBytes <= 0 {
		return Config{}, fmt.Errorf("MAX_PROFILE_BYTES must be positive")
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func splitList(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
