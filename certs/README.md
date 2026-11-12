# Local development certificates

`chainify.crt` and `chainify.key` are **not committed** — see `.gitignore`. Generate
them on the machine that will run the stack:

```bash
bun scripts/gen-cert.ts                 # localhost + 127.0.0.1
bun scripts/gen-cert.ts 192.168.18.9    # optional: add a LAN address as an extra SAN
```

The certificate is self-signed but is a **CA as well** (`basicConstraints CA:TRUE`),
so the same file can be used two ways:

- as the server certificate presented by Next.js (`--experimental-https-cert`) and
  `scripts/dev-tls.ts`;
- as the trust anchor a client loads to accept that certificate — the CSS
  container (`NODE_EXTRA_CA_CERTS`) and the Go API (`CHAINIFY_EXTRA_CA_FILE`).

## Why https for a local stack

`@inrupt/solid-client-authn-browser` signs DPoP proofs with `crypto.subtle`, and
browsers expose that only in a secure context: `https`, or plain `http` on
`localhost`. Running the whole stack on https keeps one code path for the browser
and lets a single certificate cover both the app and the issuer. Ports:

| port    | process                    | scheme | notes                                     |
| ------- | -------------------------- | ------ | ----------------------------------------- |
| `13000` | `next dev`                 | https  | terminates TLS itself                     |
| `13001` | `go run ./cmd/server`      | http   | internal only; the browser never calls it |
| `13002` | `scripts/dev-tls.ts`       | https  | proxies to `13003`                        |
| `13003` | CSS container              | http   | the image rejects TLS flags               |

## Subject alternative names

`scripts/gen-cert.ts` always includes `DNS:localhost` and `IP:127.0.0.1`, plus any
address you pass as an argument. That covers the default stack, which is pinned to
`https://localhost`.

An extra SAN does **not** by itself make the stack reachable at that address.
Community Solid Server accepts one Solid-OIDC identifier space — the one given by
`-b`/`CSS_BASE_URL` — and rejects discovery from any other host with
`500 E0001 "outside the configured identifier space"`. Moving the app to a LAN
address therefore means changing every URL in `.env` and `frontend/.env.local`,
regenerating the certificate for that address, and wiping the CSS data volume so
the Pods are rewritten under the new issuer.

## Trusting it in the browser

Both `13000` and `13002` must be accepted: they are different origins and each has
its own certificate prompt. On desktop, importing `chainify.crt` into the OS root
store is a one-time step requiring an administrator prompt. Every subsequent
regeneration invalidates that trust, so re-import after each `gen-cert` run.
