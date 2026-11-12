// Package httpapi exposes the Chainify API service over HTTP.
//
// Phase 1 keeps this service deliberately narrow: health, provider metadata, and stateless
// WebID resolution. Pod read/write happens in the browser, where the Solid-OIDC session
// lives, so no access token ever reaches this process.
package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// errorBody is the stable error shape returned to clients.
type errorBody struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	// Detail is only populated when it is safe to show (no tokens, no internal addresses
	// beyond what the client already supplied).
	Detail string `json:"detail,omitempty"`
}

// writeJSON sends a JSON response with the given status.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

// writeError sends a structured error and logs it at the right level.
//
// Client-caused failures (4xx) are logged at warn without stack traces; server-side
// failures (5xx) are logged at error. Neither path may include Authorization, Cookie, or
// DPoP values, which is enforced by the logger's own redaction.
func writeError(w http.ResponseWriter, r *http.Request, logger *slog.Logger, status int, code, message, detail string) {
	logger.LogAttrs(r.Context(), levelForStatus(status), "request failed",
		slog.String("code", code),
		slog.String("path", r.URL.Path),
		slog.Int("status", status),
	)
	writeJSON(w, status, errorBody{Error: code, Message: message, Detail: detail})
}

func levelForStatus(status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

// statusForReason maps resolver reason codes onto HTTP statuses.
//
// The mapping keeps the distinction the docs require: a blocked host is the caller's
// problem (400), an unreachable Pod is an upstream problem (502), and a Pod that refuses
// access stays a refusal (403/401) rather than being rewritten into a server error.
func statusForReason(reason string) int {
	switch reason {
	case "ssrf_blocked", "bad_request", "parse_failed", "profile_too_large":
		return http.StatusBadRequest
	case "webid_not_found":
		return http.StatusNotFound
	case "webid_forbidden", "access_denied":
		return http.StatusForbidden
	case "webid_requires_auth", "authorization_required":
		return http.StatusUnauthorized
	case "rate_limited":
		return http.StatusTooManyRequests
	case "pod_unreachable", "pod_error", "unexpected_status", "read_failed":
		return http.StatusBadGateway
	default:
		return http.StatusBadGateway
	}
}

// limitBody wraps a handler with a hard request-body ceiling.
func limitBody(next http.Handler, maxBytes int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// securityHeaders applies the response headers this service always needs.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		h.Set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=()")
		next.ServeHTTP(w, r)
	})
}

// requestLogger logs one line per request with no credential material.
//
// Query strings are recorded because the only parameter this service accepts is a WebID,
// but header values are never logged. Redaction lives in the logger, not here, so a new
// handler cannot accidentally log a token.
func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logger.Info("request",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("target", sanitizeTarget(r)),
			slog.Int("status", rec.status),
			slog.Int64("durationMs", time.Since(start).Milliseconds()),
			slog.String("remote", clientIP(r)),
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Flush lets SSE-capable handlers stream correctly when this service sits behind a proxy.
func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func sanitizeTarget(r *http.Request) string {
	target := r.URL.Path
	if r.URL.RawQuery == "" {
		return target
	}
	// Keep parameter names, drop values: a caller may paste a token-shaped string into a
	// query parameter and it must not end up in a log line.
	var parts []string
	for key := range r.URL.Query() {
		parts = append(parts, key+"=***")
	}
	if len(parts) == 0 {
		return target
	}
	return target + "?" + strings.Join(parts, "&")
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		return host[:idx]
	}
	return host
}

// recoverPanic converts a panic into a 500 without leaking the stack to the client.
func recoverPanic(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				logger.Error("panic recovered", slog.Any("panic", v), slog.String("path", r.URL.Path))
				writeJSON(w, http.StatusInternalServerError, errorBody{
					Error:   "internal_error",
					Message: "The service failed to handle this request.",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// cors allows only the configured browser origins.
//
// Credentials are never enabled here: the browser holds the Solid session and talks to the
// Pod directly, so this API must not become a credentialed surface.
func cors(allowed []string, next http.Handler) http.Handler {
	lookup := make(map[string]struct{}, len(allowed))
	for _, origin := range allowed {
		lookup[strings.TrimSpace(origin)] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := lookup[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, X-Request-Id")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireMethod restricts a handler to one method.
func requireMethod(next http.HandlerFunc, method string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			w.Header().Set("Allow", method)
			writeError(w, r, slog.Default(), http.StatusMethodNotAllowed, "method_not_allowed",
				"Only "+method+" is supported on this endpoint.", "")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// WithMiddleware assembles the service's middleware chain in one place so the order is
// explicit and reviewable.
func WithMiddleware(logger *slog.Logger, allowedOrigins []string, maxBody int64, h http.Handler) http.Handler {
	chain := securityHeaders(h)
	chain = limitBody(chain, maxBody)
	chain = cors(allowedOrigins, chain)
	chain = requestLogger(logger, chain)
	chain = recoverPanic(logger, chain)
	return chain
}
