# Chainify

Chainify is a federated business trust network for discovering and verifying businesses without moving ownership of their data into a central service. Each participant's Solid Pod is authoritative for its data: Chainify's web app and Go API provide identity resolution, connectivity, and technical checks, but keep no business catalog.

## Architecture

```text
Browser / Next.js web (https, port 13000)
  |-- same-origin /api/* and /readyz --> Go API (http, port 13001)
  |-- Solid-OIDC and authorized Pod I/O --> Solid Pods
                                               ^
scripts/dev-tls.ts (https, port 13002) -------+
  |-- forwards to container port 13003
Community Solid Server (http, 13003) ---------+
         local development Pod provider
```

The Pod is the source of truth. The API holds no session tokens, Pod contents, or authoritative catalog.

## Prerequisites

- Bun 1.3 or newer (the project pins Bun 1.3.13) for dependency installation and local frontend development
- Node.js 22 for the frontend production build and runtime (provided by the production Docker image)
- Go 1.24 or newer
- Docker with Compose v2
- OpenSSL (used by `bun scripts/gen-cert.ts` to issue the local development certificate)
- GNU Make, using a POSIX-compatible shell

## Why the local stack runs on https

`@inrupt/solid-client-authn-browser` signs DPoP proofs with `crypto.subtle`, and browsers expose that only in a secure context: `https`, or plain `http` on `localhost`. Running everything on https keeps the browser code path identical to what a real deployment uses, and lets the same certificate serve both the app and the issuer. The certificate in `certs/` is self-signed, so each client must accept it once per origin (`13000` and `13002` are separate origins and each has its own prompt).

## One origin, by necessity

Community Solid Server accepts exactly one Solid-OIDC identifier space: the origin passed as `-b`, which comes from `CSS_BASE_URL`. Any request to `/.well-known/openid-configuration` from another host is rejected with `500 E0001 "outside the configured identifier space"`.

This stack pins that origin to `https://localhost:13002/`. Opening the app at a LAN address such as `https://192.168.18.9:13000` loads the pages fine but fails at the authorization step. Login works only from `https://localhost:13000`.

Switching to the LAN origin is possible but is a migration, not a toggle: change every URL in `.env` and `frontend/.env.local`, include the address in the certificate, and wipe the CSS data volume so the Pods are recreated under the new issuer. You cannot have both at once.

## Quick start

1. Generate the development certificate:

   ```sh
   bun scripts/gen-cert.ts
   ```

   It always covers `DNS:localhost` and `IP:127.0.0.1`. Passing an address as an argument adds it as an extra subject alternative name.

2. Copy `.env.example` to `.env`, and `frontend/.env.local.example` to `frontend/.env.local`. The defaults assume `https://localhost` for both the app and the issuer.

3. Start the four processes, each in its own terminal:

   ```sh
   make css-compose   # terminal 1: CSS container, plain http on 13003
   make dev-tls       # terminal 2: https 13002 in front of the container
   make backend-run   # terminal 3: Go API on 13001
   make dev-web       # terminal 4: Next.js on https://localhost:13000
   ```

   `make dev` starts all four from one terminal and shuts them down on Ctrl-C, at the cost of interleaved output.

4. Open `https://localhost:13000`, accept the certificate warning twice (`13000` for the app, `13002` for the issuer), and sign in with the seeded demo account:

   | Email | Password |
   | --- | --- |
   | `alice@example.com` | `chainify-demo-2026` |

`docker compose` must be invoked with `--env-file .env` from the repository root; without it, Compose silently falls back to its own defaults and the issuer no longer matches the browser origin.

Run `make help` for all commands, including builds, tests, production-style Compose, and shutdown.

| Workflow | Frontend | Backend | CSS |
| --- | --- | --- | --- |
| Local (`make dev`) | Bun source process with hot reload, https | Go source process | Docker with file-backed named volume |
| Docker (`make compose-dev`) | Dev image, bind-mounted source | Dev image, bind-mounted source | Docker with file-backed named volume |
| Production-style (`make compose-prod`) | Standalone Next.js image, non-root | Static Go binary in Alpine, non-root, read-only root | Docker with persistent named volume |

## Ports

| Service | Host | Scheme | Notes |
| --- | --- | --- | --- |
| Next.js web | `13000` | https | terminates TLS itself via `--experimental-https` |
| Go API | `13001` | http | reached by the browser only through Next.js rewrites |
| `scripts/dev-tls.ts` | `13002` | https | proxies to the container port below |
| Community Solid Server | `13003` | http | the image rejects TLS flags |

`WEB_PORT`, `API_PORT`, `CSS_PORT`, and `CSS_UPSTREAM_PORT` in `.env` drive the host ports. Changing a host port means also changing the matching public URL: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SOLID_ISSUER`, `CSS_BASE_URL`, `CSS_ISSUER_URL`, and `ALLOWED_ORIGINS`.

Two rules keep the browser path simple:

- The Solid-OIDC client identifier document at `/id` derives `client_id` and `redirect_uris` from the incoming request host (`x-forwarded-host`/`host` plus `x-forwarded-proto`), not from `request.url`, which reports the bind address `0.0.0.0`. The document therefore stays correct if the stack is later moved behind a different hostname.
- Browser API calls are same-origin. `frontend/next.config.ts` rewrites `/readyz`, `/healthz`, and `/api/*` to the Go API, so the https page never issues a mixed-content request and no CORS preflight is needed.

The issuer itself is not host-adaptive: it is fixed by `-b`, which is why the origin above must match. CSS still dereferences `client_id` from inside its container, where `localhost` is the container itself. `infra/docker-compose.css.yml` maps `host.docker.internal` to the host gateway for that reason.

## Environment

`.env.example` documents every setting; `frontend/.env.local.example` covers the Next.js public values. Compose and the Make targets read the root `.env`. Public Next.js values are embedded in production images during `docker compose build`, not supplied at container startup.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `13000` | Host port for Next.js |
| `API_PORT` | `13001` | API listen port |
| `CSS_PORT` | `13002` | Public https port in front of CSS |
| `CSS_UPSTREAM_PORT` | `13003` | Container's plain-http port that `dev-tls.ts` forwards to |
| `LAN_HOST` | `192.168.18.9` | Informational: the extra subject alternative name `make cert` requests. Not used by the issuer |
| `CSS_BASE_URL` | `https://localhost:13002/` | Public CSS base URL, including trailing slash; **the** declared identifier space |
| `ALLOWED_ORIGINS` | `https://localhost:13000` | Comma-separated browser origins allowed by API CORS |
| `WEBID_FETCH_ALLOWLIST` | Local CSS plus listed public provider suffixes | Exact hosts/host:ports or dot-prefixed domain suffixes for outbound WebID and Pod requests |
| `CSS_ISSUER_URL` | `https://localhost:13002/` | Solid issuer advertised in API metadata and probed by `/readyz` |
| `CHAINIFY_EXTRA_CA_FILE` | `certs/chainify.crt` | Extra PEM root for outbound TLS; needed because Go on Windows ignores `SSL_CERT_FILE` |
| `FETCH_TIMEOUT_MS` | `8000` | Outbound WebID/Pod request timeout |
| `MAX_PROFILE_BYTES` | `1048576` | Maximum profile document size |
| `LOG_LEVEL` | `info` | API log level: `debug`, `info`, or `error` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:13001` | Rewrite target for same-origin `/api/*` calls |
| `NEXT_PUBLIC_SOLID_ISSUER` | `https://localhost:13002/` | Browser-visible Solid issuer |
| `NEXT_PUBLIC_SOLID_CLIENT_ID` | `https://localhost:13000/id` | Solid-OIDC client identifier document URL; configure for deployment |
| `NEXT_PUBLIC_APP_URL` | `https://localhost:13000` | Public web origin |

The example allowlist intentionally permits only the local CSS and explicitly named public provider suffixes. Set production origins, allowlist entries, and public URLs explicitly; do not use a wildcard CORS origin.

### Migrating the stack to a different origin

Because CSS accepts one identifier space, moving the app to another host is a migration:

1. `bun scripts/gen-cert.ts <new-address>` regenerates `certs/chainify.crt` and `certs/chainify.key`. `localhost` and `127.0.0.1` stay in the SAN list; the argument adds the new address.
2. Update `LAN_HOST`, `CSS_BASE_URL`, `CSS_ISSUER_URL`, `ALLOWED_ORIGINS`, `WEBID_FETCH_ALLOWLIST`, and the `NEXT_PUBLIC_*` URLs in `.env` and `frontend/.env.local`, all to the new origin.
3. The CSS data volume stores WebIDs written at Pod creation time. A volume created under a different issuer keeps those stale WebIDs, because the seed never rewrites an existing Pod. To rebuild it: `docker compose --env-file .env -f infra/docker-compose.css.yml down -v`, then `docker volume create chainify-css-data` (the volume is declared `external: true`), then `up -d`. This destroys the demo Pods.

`infra/css/seed-accounts.json` seeds two demo accounts, both with `settings.linkStorage: true`: `alice@example.com` (seller) and `bob@example.com` (buyer). Password for both is `chainify-demo-2026`. Without `linkStorage`, the CSS profile template omits `pim:storage`, and resolution ends in `422 no_storage_declared`.

## Current limitations

- Server-side DPoP validation is not implemented. Authenticated Pod reads and writes run in the browser; the API handles identity resolution, federated discovery, and structural document checks without holding user sessions.
- Verification is structural. `/api/listing/verify` checks the document's shape and consistency, never real-world truth, and the verdict is capped at `warn` so a "verified" label cannot be produced.
- Evidence records are claims written by their owner. No signature is checked, no issuer registry exists, and issuers are never contacted.
- An RFQ is two copies, not one conversation. The thread lives in each party's own Pod; copying it to the counterparty's Pod is manual, and `cfy:delivery` records attempts rather than claiming delivery.
- Discovery is best-effort. Each participant index is read independently, up to 24 per query at concurrency 4; an unreachable peer is reported, not retried, and results are never cached.
- Sharing evidence uses the Pod's own ACL. When the Pod exposes no `.acl` resource, or the account does not control it, the UI reports that access was not granted instead of showing success.
- Historical provider uptime is not collected. Reachability is a point-in-time observation, not an availability history or service-level guarantee.
- The local issuer is bound to a single origin and a self-signed certificate. Login works only from `https://localhost:13000`. This is a development topology, not a deployment one.

## Documentation

The Indonesian product, architecture, data-model, security, and implementation documents are in [`docs/`](docs/README.md). Certificate and port notes live in [`certs/README.md`](certs/README.md).
