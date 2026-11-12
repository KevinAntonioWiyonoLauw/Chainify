package logging

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

const (
	// A structurally valid JWT-shaped value; not a real credential.
	sampleJWT = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsImF1ZCI6InBvZCJ9.c2lnbmF0dXJlLXZhbHVl"
)

func captureLogs(t *testing.T, fn func(logger *slog.Logger)) map[string]any {
	t.Helper()
	var buf bytes.Buffer
	fn(New(&buf, "info"))

	var record map[string]any
	if err := json.Unmarshal(buf.Bytes(), &record); err != nil {
		t.Fatalf("log output is not valid JSON: %v\noutput: %s", err, buf.String())
	}
	return record
}

func TestRedactsAuthorizationAttribute(t *testing.T) {
	record := captureLogs(t, func(logger *slog.Logger) {
		logger.Info("request", "Authorization", "Bearer "+sampleJWT)
	})
	if got := record["Authorization"]; got != "[REDACTED]" {
		t.Fatalf("Authorization = %v, want [REDACTED]", got)
	}
}

func TestRedactsCaseInsensitiveSensitiveKeys(t *testing.T) {
	for _, key := range []string{"cookie", "Cookie", "SET-COOKIE", "DPoP", "access_token", "client_secret", "password"} {
		record := captureLogs(t, func(logger *slog.Logger) {
			logger.Info("request", key, "super-secret-value")
		})
		if got := record[key]; got != "[REDACTED]" {
			t.Errorf("%s = %v, want [REDACTED]", key, got)
		}
	}
}

func TestRedactsJWTInsideFreeText(t *testing.T) {
	record := captureLogs(t, func(logger *slog.Logger) {
		logger.Info("resolution failed", "detail", "upstream rejected token "+sampleJWT)
	})
	detail, _ := record["detail"].(string)
	if strings.Contains(detail, sampleJWT) {
		t.Fatal("a JWT-shaped value survived inside a free-text attribute")
	}
	if !strings.Contains(detail, "[REDACTED]") {
		t.Fatalf("detail = %q, want a redaction marker", detail)
	}
}

func TestRedactsBearerPrefix(t *testing.T) {
	record := captureLogs(t, func(logger *slog.Logger) {
		logger.Info("detail", "msg2", "Bearer abcdefghijklmnopqrstuvwxyz")
	})
	joined, _ := json.Marshal(record)
	if strings.Contains(string(joined), "abcdefghijklmnopqrstuvwxyz") {
		t.Fatal("a bearer token value survived redaction")
	}
}

func TestKeepsOrdinaryValues(t *testing.T) {
	record := captureLogs(t, func(logger *slog.Logger) {
		logger.Info("request", "method", "GET", "path", "/healthz", "status", 200)
	})
	if record["method"] != "GET" || record["path"] != "/healthz" {
		t.Fatalf("ordinary attributes were altered: %#v", record)
	}
	if record["status"] != float64(200) {
		t.Fatalf("status = %v, want 200", record["status"])
	}
}

func TestTruncatesLongValues(t *testing.T) {
	record := captureLogs(t, func(logger *slog.Logger) {
		logger.Info("request", "detail", strings.Repeat("a", 500))
	})
	detail, _ := record["detail"].(string)
	if len(detail) > 240 {
		t.Fatalf("detail length = %d, want it truncated near 200", len(detail))
	}
}

func TestScrubsAttributesAttachedViaWith(t *testing.T) {
	record := captureLogs(t, func(logger *slog.Logger) {
		child := logger.With("Authorization", "Bearer "+sampleJWT, "component", "identity")
		child.Info("child record")
	})
	if record["Authorization"] != "[REDACTED]" {
		t.Fatalf("Authorization via With = %v, want [REDACTED]", record["Authorization"])
	}
	if record["component"] != "identity" {
		t.Fatalf("component = %v, want it preserved", record["component"])
	}
}

func TestLevelFiltering(t *testing.T) {
	var buf bytes.Buffer
	logger := New(&buf, "error")
	logger.Info("must not appear")
	logger.Debug("must not appear either")
	if buf.Len() != 0 {
		t.Fatalf("expected no output below the error level, got %s", buf.String())
	}
}
