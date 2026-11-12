// Local TLS terminator for the Chainify dev stack.
//
// Why this exists: Solid-OIDC DPoP needs `crypto.subtle`, and browsers expose it
// only on secure contexts. `https://` and `http://localhost` qualify; a plain
// `http://<LAN IP>` origin does not. A phone or another machine reaches the app
// over the LAN IP, so the web app and the CSS issuer both need TLS.
//
// Topology:
//   https :13000  -> Next.js, which terminates TLS itself (next dev --experimental-https).
//   https :13002  -> this proxy -> Community Solid Server, plain http on 127.0.0.1:13003
//
// The CSS image rejects TLS flags, so its https origin is terminated here.
//
// Run from the repository root:  bun scripts/dev-tls.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const certPath = join(repoRoot, "certs", "chainify.crt");
const keyPath = join(repoRoot, "certs", "chainify.key");

// Fail fast on missing material instead of serving a half-broken origin.
readFileSync(certPath);
readFileSync(keyPath);

const listenPort = Number(process.env.CSS_TLS_PORT ?? 13002);
const upstreamBase = process.env.CSS_UPSTREAM ?? "http://127.0.0.1:13003";
const upstreamUrl = new URL(upstreamBase);

// Hop-by-hop headers must not be forwarded; the runtime owns them per socket.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

Bun.serve({
  port: listenPort,
  hostname: "0.0.0.0",
  tls: { cert: Bun.file(certPath), key: Bun.file(keyPath) },
  idleTimeout: 120,
  async fetch(request) {
    const url = new URL(request.url);
    // Keep the path exactly as received; CSS signs identifiers by path.
    const target = upstreamBase.replace(/\/+$/, "") + url.pathname + url.search;

    const headers = new Headers();
    for (const [name, value] of request.headers) {
      if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
    }
    headers.set("host", upstreamUrl.host);
    headers.set("x-forwarded-proto", "https");
    headers.set("x-forwarded-host", request.headers.get("host") ?? url.host);

    const init: RequestInit & { duplex?: string } = {
      method: request.method,
      headers,
      // Do not follow redirects: the client must see CSS's own Location values.
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }

    const upstreamResponse = await fetch(target, init).catch((error) => {
      // A single dropped upstream socket must not take the whole proxy down:
      // the browser would then see a dead origin mid-login.
      console.error(`[tls] upstream error for ${url.pathname}:`, error?.message ?? error);
      return new Response("Upstream unavailable", { status: 502 });
    });

    const responseHeaders = new Headers();
    for (const [name, value] of upstreamResponse.headers) {
      if (!HOP_BY_HOP.has(name.toLowerCase())) responseHeaders.set(name, value);
    }

    // `Headers.set` collapses repeated `Set-Cookie` into one comma-joined string,
    // which the browser then parses as a single malformed cookie. CSS issues the
    // account session, the OIDC session and a __Host- marker on the same response;
    // dropping all but one makes `authenticating` false on the account page and
    // hides the "Continue authentication" button. Re-emit each cookie separately.
    const setCookies =
      typeof upstreamResponse.headers.getSetCookie === "function"
        ? upstreamResponse.headers.getSetCookie()
        : [];
    responseHeaders.delete("set-cookie");
    for (const cookie of setCookies) responseHeaders.append("set-cookie", cookie);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
});

console.log(`[tls] https://localhost:${listenPort} -> ${upstreamBase} (community solid server)`);
