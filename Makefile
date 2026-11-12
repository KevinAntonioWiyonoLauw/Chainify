# Windows GNU Make may have no sh on PATH; prefer Git for Windows' POSIX shell.
# No PATH fallback is needed on Unix, where /bin/sh is always available.
ifeq ($(OS),Windows_NT)
SHELL := C:/Program Files/Git/bin/sh.exe
else
SHELL := /bin/sh
endif

# Skip Git's shell directory conversion for absolute POSIX paths on Windows.
ifeq ($(OS),Windows_NT)
export MSYS_NO_PATHCONV := 1
export MSYS2_ARG_CONV_EXCL := *
endif

# Optional .env values are exported to locally-run frontend/backend processes.
# Docker Compose loads the same root .env itself.
-include .env
export

# .env is written for processes started at the repo root. Go targets `cd backend`
# first, and the API reads CHAINIFY_EXTRA_CA_FILE itself, so the path is made
# absolute here instead of silently pointing at backend/certs/.
BACKEND_ENV = CHAINIFY_EXTRA_CA_FILE='$(abspath $(CURDIR)/$(CHAINIFY_EXTRA_CA_FILE))'

COMPOSE_CSS = docker compose --env-file .env -f infra/docker-compose.css.yml
COMPOSE_DEV = docker compose -f infra/docker-compose.dev.yml
COMPOSE_PROD = docker compose -f infra/docker-compose.prod.yml
CSS_PORT ?= 13002
CSS_UPSTREAM_PORT ?= 13003
API_PORT ?= 13001
WEB_PORT ?= 13000
# Solid-OIDC needs crypto.subtle, so the browser origin must be https once it is
# not localhost. LAN_HOST is the certificate's subject and the issuer's host.
LAN_HOST ?= localhost
CSS_BASE_URL ?= https://$(LAN_HOST):$(CSS_PORT)/
CSS_ISSUER_URL ?= https://$(LAN_HOST):$(CSS_PORT)/
NEXT_PUBLIC_SOLID_ISSUER ?= https://$(LAN_HOST):$(CSS_PORT)/
NEXT_PUBLIC_API_BASE_URL ?= http://localhost:$(API_PORT)
NEXT_PUBLIC_APP_URL ?= https://$(LAN_HOST):$(WEB_PORT)
NEXT_PUBLIC_SOLID_CLIENT_ID ?= $(NEXT_PUBLIC_APP_URL)/id

.DEFAULT_GOAL := help

.PHONY: help install cert dev dev-tls dev-web backend dev-backend backend-run build build-backend test test-backend test-web vet-backend lint css css-compose css-compose-down compose-dev compose-dev-down compose-prod compose-prod-down compose-logs compose-ps clean

help: ## List available commands
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | sed -e 's/:.*## /|/' | awk -F '|' '{printf "%-20s %s\n", $$1, $$2}'

install: ## Install frontend dependencies with Bun
	cd frontend && bun install

cert: ## Regenerate certs/ for localhost plus LAN_HOST (needs OpenSSL)
	bun scripts/gen-cert.ts $(LAN_HOST)

# Run without Compose: CSS in Docker, TLS proxy, Go, and Bun as host processes.
dev: ## Run CSS, TLS proxy, backend, and frontend locally (Ctrl-C stops all)
	@$(MAKE) css-compose & \
	css_pid=$$!; \
	$(MAKE) dev-tls & \
	tls_pid=$$!; \
	$(MAKE) backend & \
	api_pid=$$!; \
	$(MAKE) dev-web & \
	web_pid=$$!; \
	trap 'kill $$api_pid $$web_pid $$tls_pid $$css_pid 2>/dev/null; $(COMPOSE_CSS) down >/dev/null 2>&1' EXIT INT TERM; \
	wait $$web_pid

dev-tls: ## Terminate https on $(CSS_PORT) in front of the CSS container on $(CSS_UPSTREAM_PORT)
	bun scripts/dev-tls.ts

dev-web: ## Run Next.js locally with https on port $(WEB_PORT)
	cd frontend && bun run dev

# backend is canonical: ./cmd/server includes the package and supports future Go files.
backend: ## Run the Go API package from source (canonical)
	cd backend && $(BACKEND_ENV) go run ./cmd/server

dev-backend: backend ## Alias for the canonical Go API command

backend-run: ## Run main.go directly (equivalent only while main.go has no sibling files)
	cd backend && $(BACKEND_ENV) go run ./cmd/server/main.go

build: ## Build both frontend and backend
	cd frontend && bun run build
	$(MAKE) build-backend

build-backend: ## Build a static Go binary at bin/chainify-api
	cd backend && CGO_ENABLED=0 go build -trimpath -o ../bin/chainify-api ./cmd/server

test: ## Run Go tests, frontend tests, and frontend lint
	$(MAKE) test-backend
	$(MAKE) test-web
	$(MAKE) lint

test-backend: ## Run all Go tests
	cd backend && $(BACKEND_ENV) go test ./...

test-web: ## Run the frontend unit tests
	cd frontend && bun run test

vet-backend: ## Vet and format-check the Go packages
	cd backend && go vet ./... && test -z "$$(gofmt -l .)"

lint: ## Lint the frontend
	cd frontend && bun run lint

css: ## Run a one-off Community Solid Server container on host port $(CSS_UPSTREAM_PORT)
	docker run --rm --name chainify-css \
		-p $(CSS_UPSTREAM_PORT):3000 \
		-v chainify-css-data:/data \
		solidproject/community-server:latest \
		-c @css:config/file.json -f /data -b $(CSS_BASE_URL) & \
	css_pid=$$!; \
	trap 'kill $$css_pid 2>/dev/null; docker stop chainify-css >/dev/null 2>&1' EXIT INT TERM; \
	wait $$css_pid

css-compose: ## Start only CSS in Docker; run Go and Next.js directly on the host
	$(COMPOSE_CSS) up -d

css-compose-down: ## Stop the CSS-only Compose stack (keeps Pod data)
	$(COMPOSE_CSS) down

compose-dev: ## Build and start the Docker development stack
	$(COMPOSE_DEV) up --build -d

compose-dev-down: ## Stop the Docker development stack (keeps CSS data)
	$(COMPOSE_DEV) down

compose-prod: ## Build and start the production-style Docker stack
	$(COMPOSE_PROD) up --build -d

compose-prod-down: ## Stop the production-style Docker stack (keeps CSS data)
	$(COMPOSE_PROD) down

compose-logs: ## Follow Docker development stack logs
	$(COMPOSE_DEV) logs -f

compose-ps: ## Show Docker development stack status
	$(COMPOSE_DEV) ps

clean: ## Remove frontend/.next, bin/, and frontend/node_modules
	rm -rf frontend/.next frontend/node_modules bin
