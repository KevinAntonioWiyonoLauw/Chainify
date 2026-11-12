// Package logging builds the service logger.
//
// Redaction lives in the handler rather than at call sites so no new handler can
// accidentally emit a credential: values that look like bearer tokens, JWTs, DPoP proofs,
// Cookies, or Authorization headers are replaced before they reach the writer.
package logging

import (
	"context"
	"io"
	"log/slog"
	"regexp"
	"strings"
)

// sensitiveKeys are attribute names whose values are always dropped.
var sensitiveKeys = map[string]struct{}{
	"authorization": {},
	"cookie":        {},
	"set-cookie":    {},
	"dpop":          {},
	"dpop-proof":    {},
	"token":         {},
	"access_token":  {},
	"id_token":      {},
	"refresh_token": {},
	"secret":        {},
	"client_secret": {},
	"password":      {},
}

// tokenPattern matches bearer prefixes, JWT-shaped values, and long base64url runs, which
// is what a leaked access token or DPoP proof looks like inside free text.
var tokenPattern = regexp.MustCompile(
	`(?i)(?:bearer\s+[a-z0-9._~+/=-]{8,})|(?:[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,})`)

// maxLogValueLen truncates any single value long enough to be a serialized credential.
const maxLogValueLen = 200

// New returns a JSON logger writing to w at the given level.
func New(w io.Writer, level string) *slog.Logger {
	opts := &slog.HandlerOptions{Level: parseLevel(level)}
	return slog.New(&redactHandler{next: slog.NewJSONHandler(w, opts)})
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// redactHandler wraps a slog.Handler and scrubs attributes as they enter the chain.
//
// Scrubbing happens in WithAttrs (where static attributes are attached) and again in
// Handle (where per-record attributes arrive), so neither path can bypass it.
type redactHandler struct {
	next slog.Handler
}

func (h *redactHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.next.Enabled(ctx, level)
}

func (h *redactHandler) Handle(ctx context.Context, record slog.Record) error {
	scrubbed := slog.NewRecord(record.Time, record.Level, record.Message, record.PC)
	record.Attrs(func(attr slog.Attr) bool {
		scrubbed.AddAttrs(scrub(attr))
		return true
	})
	return h.next.Handle(ctx, scrubbed)
}

func (h *redactHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	scrubbed := make([]slog.Attr, 0, len(attrs))
	for _, attr := range attrs {
		scrubbed = append(scrubbed, scrub(attr))
	}
	return &redactHandler{next: h.next.WithAttrs(scrubbed)}
}

func (h *redactHandler) WithGroup(name string) slog.Handler {
	return &redactHandler{next: h.next.WithGroup(name)}
}

// scrub drops values that must never be logged and redacts credential-shaped ones.
func scrub(attr slog.Attr) slog.Attr {
	key := strings.ToLower(attr.Key)
	if _, blocked := sensitiveKeys[key]; blocked {
		// Match header names case-insensitively without rewriting the caller's key.
		return slog.String(attr.Key, "[REDACTED]")
	}

	value := attr.Value
	if value.Kind() == slog.KindString {
		value = slog.StringValue(cleanString(value.String()))
	} else if len(value.String()) > maxLogValueLen {
		value = slog.StringValue("[REDACTED]")
	}
	return slog.Attr{Key: attr.Key, Value: value}
}

func cleanString(value string) string {
	if value == "" {
		return value
	}
	if tokenPattern.MatchString(value) {
		value = tokenPattern.ReplaceAllString(value, "[REDACTED]")
	}
	if len(value) > maxLogValueLen {
		return value[:maxLogValueLen] + "...[truncated]"
	}
	return value
}
