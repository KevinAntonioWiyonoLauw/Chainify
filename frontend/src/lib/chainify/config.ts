export interface ChainifyConfig {
  apiBaseUrl: string;
  solidIssuer: string;
  solidClientId: string;
  appUrl: string;
}

/** Strip trailing slashes so URL joining stays predictable. */
function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

/**
 * Resolved on every access rather than frozen at module evaluation.
 *
 * `NEXT_PUBLIC_*` values are inlined by the bundler, but a module that captured
 * them once can outlive a dev-server env reload and serve a stale origin to the
 * RSC payload while the HTML stays current. Reading lazily keeps both paths in
 * agreement after an env change.
 *
 * In the browser the app and the issuer follow the origin actually in use, so
 * opening the app from a phone on the LAN (`https://192.168.18.9:13000`) calls
 * `/id` and `:13002` on that same host instead of hard-coding `localhost`,
 * which on a phone means the phone itself.
 */
function browserOrigin(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.origin;
}

/** Swaps the host of a configured URL for the browser's host, keeping its port. */
function alignHost(configured: string, origin: string): string {
  try {
    const next = new URL(configured);
    const here = new URL(origin);
    if (next.hostname === here.hostname) return configured;
    next.hostname = here.hostname;
    return next.toString();
  } catch {
    return configured;
  }
}

/**
 * Resolves a configured client identifier against the origin the app is served on.
 *
 * A relative value such as `/id` is the point: the client document is generated from the
 * request host, so the identifier that dereferences to it is the one on the current
 * origin. `alignHost` cannot do this — it parses with `new URL()`, which throws on a
 * relative reference, and the raw `/id` would then travel to the issuer as `client_id`,
 * which OIDC requires to be an absolute URI.
 */
function resolveClientId(configured: string, origin: string): string {
  try {
    return new URL(configured).toString();
  } catch {
    // Not absolute: join it onto the origin in use.
  }
  if (configured.startsWith("/")) return `${origin}${configured}`;
  return configured;
}

function resolveConfig(): ChainifyConfig {
  const apiBaseUrl = normalizeUrl(
    readEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:13001"),
  );
  // The issuer keeps its conventional trailing slash for OIDC discovery.
  // scripts/dev-tls.ts terminates https for CSS on 13002.
  const configuredIssuer = readEnv(
    "NEXT_PUBLIC_SOLID_ISSUER",
    "https://localhost:13002/",
  );
  // A URL dereferencing to a Client Identifier Document, per Solid-OIDC. Relative by
  // default so the document at `/id` and the identifier sent to the issuer are derived
  // from the same host.
  const configuredClientId = readEnv("NEXT_PUBLIC_SOLID_CLIENT_ID", "/id");
  const appUrl = normalizeUrl(
    readEnv("NEXT_PUBLIC_APP_URL", "https://localhost:13000"),
  );

  const origin = browserOrigin();
  if (!origin) {
    // Server pass: there is no host to join a relative identifier onto. The browser
    // resolves it on the client; `NEXT_PUBLIC_*` is only a fallback there.
    return {
      apiBaseUrl,
      solidIssuer: configuredIssuer,
      solidClientId: configuredClientId,
      appUrl,
    };
  }

  return {
    apiBaseUrl: normalizeUrl(alignHost(apiBaseUrl, origin)),
    solidIssuer: alignHost(configuredIssuer, origin),
    solidClientId: resolveClientId(configuredClientId, origin),
    appUrl: normalizeUrl(origin),
  };
}

export const chainifyConfig: ChainifyConfig = {
  get apiBaseUrl() {
    return resolveConfig().apiBaseUrl;
  },
  get solidIssuer() {
    return resolveConfig().solidIssuer;
  },
  get solidClientId() {
    return resolveConfig().solidClientId;
  },
  get appUrl() {
    return resolveConfig().appUrl;
  },
};
