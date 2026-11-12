// Public Solid-OIDC Client Identifier Document. It contains no client secret;
// the browser authenticates with DPoP as a public client.
//
// The document is derived from the host the request actually arrived on rather
// than a fixed env value: the app is opened as https://localhost:13000 on this
// machine and https://192.168.18.9:13000 from a phone, and CSS dereferences the
// exact client_id it was given. A body naming a different host than the URL it is
// served from would be rejected as a mismatched client identifier.
//
// `request.url` cannot be used for this: `next dev --hostname 0.0.0.0` makes it
// report the bind address (https://0.0.0.0:13000), which no client can resolve.
function resolveOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function GET(request: Request) {
  const origin = resolveOrigin(request);
  const clientId = `${origin}/id`;

  const document = {
    "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
    client_id: clientId,
    client_name: "Chainify",
    application_type: "web",
    redirect_uris: [`${origin}/callback`],
    post_logout_redirect_uris: [`${origin}/`],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
    scope: "openid webid offline_access",
  };

  return Response.json(document, {
    headers: {
      "Content-Type": "application/ld+json; charset=utf-8",
      // The body depends on the request host, so a shared cache must not serve
      // one host's document to another.
      "Cache-Control": "no-store",
      Vary: "Host, X-Forwarded-Host, X-Forwarded-Proto",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
