"use client";

import { getDefaultSession, type Session } from "@inrupt/solid-client-authn-browser";
import { chainifyConfig } from "@/lib/chainify/config";
import type { SolidSessionState } from "@/lib/chainify/types";

/**
 * Exposes the live session to the browser console and to the e2e script.
 *
 * `getSession()` hands out the one session instance the app uses, so anything that
 * reaches it exercises the same DPoP fetch (and the same failure modes) as the UI.
 * Dev only, and guarded for the server pass: this module is also evaluated during SSR,
 * where `window` does not exist.
 */
declare global {
  interface Window {
    __chainifySession?: { getSession: () => Session };
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__chainifySession = { getSession };
}

/**
 * Browser-only wrapper over the Solid-OIDC session singleton.
 * DPoP validation is performed by the Pod; this service never sees the token.
 */

export function getSession(): Session {
  return getDefaultSession();
}

/**
 * Cached so `useSyncExternalStore` receives a stable reference. Returning a
 * fresh object on every read makes React re-render without end.
 */
let stateCache: SolidSessionState | null = null;
let stateKey = "";

export function readSessionState(): SolidSessionState {
  const info = getSession().info;
  const key = `${info.isLoggedIn}|${info.webId ?? ""}|${info.sessionId ?? ""}`;
  if (stateCache && stateKey === key) return stateCache;

  stateCache = {
    status: info.isLoggedIn ? "authenticated" : "anonymous",
    isLoggedIn: info.isLoggedIn,
    webId: info.webId,
    sessionId: info.sessionId,
  };
  stateKey = key;
  return stateCache;
}

/**
 * Refreshes a stored session through the provider.
 *
 * `restorePreviousSession: true` is a *silent re-authentication*: the library stores the
 * current page under `solidClientAuthn:currentUrl`, goes to the issuer, and navigates back.
 * When it cannot complete, that navigation still happens, so this function must never be
 * called from a page the owner merely opened. `use-solid-session.ts` owns the guard that
 * makes it safe; nothing else should call it directly.
 */
export async function restoreSession(): Promise<SolidSessionState> {
  const info = await getSession().handleIncomingRedirect({
    restorePreviousSession: true,
  });
  return {
    status: info?.isLoggedIn ? "authenticated" : "anonymous",
    isLoggedIn: info?.isLoggedIn ?? false,
    webId: info?.webId,
    sessionId: info?.sessionId,
  };
}

/**
 * Completes the redirect and reuses the live singleton session.
 *
 * `handleIncomingRedirect` reports the result of the exchange it just performed.
 * It returns `isLoggedIn: false` when the URL carries no OAuth parameters — for
 * example when the effect runs a second time, or when the router has already
 * stripped `code`/`state` from the address bar. The singleton session is still
 * authenticated in that case, so its state is the authoritative answer.
 */
export async function completeRedirect(): Promise<SolidSessionState> {
  const session = getSession();
  // No `restorePreviousSession` here: a callback that arrives without OAuth parameters
  // must not kick off another silent re-authentication. Inside the exchange
  // `restorePreviousSession` changes nothing, and outside it the flag is what turns a
  // stray visit to /callback into an endless loop.
  const incoming = await session.handleIncomingRedirect();
  if (incoming?.isLoggedIn) {
    stateCache = null;
    return {
      status: "authenticated",
      isLoggedIn: true,
      webId: incoming.webId,
      sessionId: incoming.sessionId,
    };
  }

  const current = session.info;
  if (current.isLoggedIn) {
    stateCache = null;
    return {
      status: "authenticated",
      isLoggedIn: true,
      webId: current.webId,
      sessionId: current.sessionId,
    };
  }

  return {
    status: "anonymous",
    isLoggedIn: false,
    webId: current.webId,
    sessionId: current.sessionId,
  };
}

/**
 * Reads and clears the page that started the sign-in.
 *
 * The authn library stores it under `solidClientAuthn:currentUrl` before it leaves for
 * the issuer. The value is untrusted localStorage, so only a same-origin path is
 * returned and the callback never becomes an open redirect.
 */
export function takeReturnPath(origin: string): string | null {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("solidClientAuthn:currentUrl");
    window.localStorage.removeItem("solidClientAuthn:currentUrl");
  } catch {
    return null;
  }
  if (!stored) return null;
  try {
    const url = new URL(stored);
    if (url.origin !== origin) return null;
    const path = `${url.pathname}${url.search}`;
    // Sending the owner back to the callback or the login page would loop.
    return path.startsWith("/callback") || path.startsWith("/login") ? null : path;
  } catch {
    return null;
  }
}

export async function login(issuer: string): Promise<void> {
  const redirectUrl = `${window.location.origin}/callback`;
  await getSession().login({
    oidcIssuer: issuer,
    redirectUrl,
    clientId: chainifyConfig.solidClientId,
    tokenType: "DPoP",
  });
}

export async function logout(): Promise<void> {
  await getSession().logout();
}

/** Reads a Pod resource with the session's authenticated fetch. */
export async function readResource(url: string): Promise<string> {
  const response = await getSession().fetch(url, {
    headers: { Accept: "text/turtle, text/plain, application/ld+json" },
  });
  if (!response.ok) {
    throw new Error(`Read failed with HTTP ${response.status}.`);
  }
  return response.text();
}

/** Writes a small text/turtle test resource to the Pod. */
export async function writeResource(
  url: string,
  body: string,
  contentType = "text/turtle",
): Promise<void> {
  const response = await getSession().fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(`Write failed with HTTP ${response.status}.`);
  }
}

