// Command server runs the Chainify API service.
//
// Phase 1 role: resolve a WebID into its Pod storage location and issuer, report health,
// and probe Pod reachability. It holds no session tokens and no Pod contents, so a
// compromise of this process does not expose any owner's private data.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/chainify/backend/internal/config"
	"github.com/chainify/backend/internal/httpapi"
	"github.com/chainify/backend/internal/identity"
	"github.com/chainify/backend/internal/logging"
	"github.com/chainify/backend/internal/pod"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "chainify-api: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	logger := logging.New(os.Stdout, cfg.LogLevel)
	logger.Info("starting chainify-api",
		"addr", cfg.Addr,
		"issuer", cfg.CSSIssuerURL,
		"origins", cfg.AllowedOrigins,
		"fetchAllowlist", cfg.FetchAllowlist,
	)

	guard := identity.NewGuard(cfg.FetchAllowlist)
	resolver := identity.NewResolver(guard, cfg.MaxProfileBytes, cfg.FetchTimeout)
	prober := pod.NewProber(guard, cfg.FetchTimeout)

	server := httpapi.New(cfg, logger, resolver, prober)
	// The readiness probe speaks to the same issuer as identity resolution, so it must
	// use the same transport: a local provider serves https with a certificate the
	// system store does not know.
	server.UseProviderTransport(guard.NewTransport(cfg.FetchTimeout))

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	// Shut down on SIGINT/SIGTERM so `docker compose down` and Ctrl-C stay clean.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", cfg.Addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
		logger.Info("shutdown requested")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	logger.Info("stopped cleanly")
	return nil
}
