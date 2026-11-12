"use client";

import { useSyncExternalStore } from "react";
import { getSession, readSessionState, restoreSession } from "@/lib/solid/session";
import type { SolidSessionState } from "@/lib/chainify/types";

/**
 * One session snapshot for the whole tab.
 *
 * Two pitfalls make a per-hook `useState` the wrong tool here:
 *
 *  - Every page mounted its own `restoreSession()` effect. `restorePreviousSession`
 *    spends a refresh token, so two callers race for one token; the loser retries the
 *    authorization code flow and the browser navigates *away* from the page the owner
 *    just opened. That is why the shared restore promise below has to exist: one
 *    exchange per tab, however many components read the session.
 *  - The authenticated fetch only exists after the session is restored, so a page that
 *    writes to the Pod must know the difference between "still restoring" and
 *    "signed out" instead of assuming anonymous on first render.
 */

const LOADING: SolidSessionState = { status: "loading", isLoggedIn: false };

/** Shared across mounts: a second restore would redeem or burn the same token. */
let restoring: Promise<SolidSessionState> | null = null;

/**
 * How long one refresh may take before the tab stops waiting for it.
 *
 * A hung or rejected refresh must not leave the app on a spinner forever: after this
 * the session is treated as unverified and the owner is offered a fresh sign-in.
 */
const RESTORE_TIMEOUT_MS = 10_000;

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(label)), ms);
  });
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([work, timeoutAfter(ms, label)]);
}

/** Keys the authn library uses to remember the active session across page loads. */
const KEY_CURRENT_SESSION = "solidClientAuthn:currentSession";
const KEY_CURRENT_URL = "solidClientAuthn:currentUrl";

/** One attempt per tab: a failed silent restore must not be retried on every mount. */
let restoreAttempted = false;

/**
 * Restores a previous session, and only a previous session.
 *
 * `restoreSession()` alone cannot do this. With `restorePreviousSession: true` it
 * re-authenticates through the provider, and when that cannot complete it stores the
 * current page and navigates the owner away. In practice that turned every page except
 * the post-login landing page into a bounce back to /dashboard, and looped on a token
 * the provider had already rejected.
 *
 * Reading the library's own session keys gives the same answer with none of that. The
 * library only treats the return as a silent re-authentication when
 * `solidClientAuthn:currentUrl` is present, so seeding it lets the stored session restore
 * in place:
 *
 *   - no stored session      -> anonymous, nothing to attempt
 *   - usable stored session  -> restored in place
 *   - stored but rejected    -> the attempt is spent, the owner sees the sign-in notice
 *
 * After a restart or a crash the sealed refresh record is gone and the restore fails.
 * The notice is the honest outcome there: this tab cannot reach the Pod, and only an
 * interactive sign-in can fix that.
 */
function ensureSession(): Promise<SolidSessionState> {
  restoring ??= (async (): Promise<SolidSessionState> => {
    const hasSession = window.localStorage.getItem(KEY_CURRENT_SESSION) !== null;
    if (!hasSession || restoreAttempted) {
      return { status: "anonymous", isLoggedIn: false };
    }

    // The library records the page that started the login under `currentUrl` and only
    // clears it on the silent-authentication path. A leftover value is therefore a
    // stale "you came back from a silent re-authentication" marker, and on the next
    // page load the library trusts it over the address bar. Clearing it first is what
    // stops a deep link from being silently replaced.
    window.localStorage.removeItem(KEY_CURRENT_URL);
    restoreAttempted = true;
    try {
      const session = await withTimeout(
        restoreSession(),
        RESTORE_TIMEOUT_MS,
        "session restore timed out",
      );
      if (session.isLoggedIn) return session;
    } catch {
      // A rejected restore is an anonymous tab, not an error page.
    }
    window.localStorage.removeItem(KEY_CURRENT_URL);
    return { status: "anonymous", isLoggedIn: false };
  })().finally(() => {
    restoring = null;
  });
  return restoring;
}

/* ---------------------------------------------------------------------------
   Store plumbing
   ------------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  const session = getSession();
  const events = session.events;
  events.on("login", listener);
  events.on("logout", listener);
  events.on("sessionRestore", listener);
  window.addEventListener("storage", listener);
  listeners.add(listener);

  return () => {
    events.off("login", listener);
    events.off("logout", listener);
    events.off("sessionRestore", listener);
    window.removeEventListener("storage", listener);
    listeners.delete(listener);
  };
}

function getSnapshot(): SolidSessionState {
  return readSessionState();
}

function getServerSnapshot(): SolidSessionState {
  return LOADING;
}

function subscribeWithRestore(listener: () => void): () => void {
  // Restoring once per subscribing component is still one network exchange, because
  // `ensureSession` memoises the promise. It is started here rather than in an effect
  // so the snapshot is already correct on the first client paint after hydration.
  void ensureSession().then(emit, emit);
  return subscribe(listener);
}

/**
 * Reads the live Solid session, restoring it on first use.
 *
 * `status` is `loading` until the restore settles, then `authenticated` or
 * `anonymous`. Consumers that need to distinguish the three should read `status`
 * rather than `isLoggedIn`.
 */
export function useSolidSession(): SolidSessionState {
  return useSyncExternalStore(subscribeWithRestore, getSnapshot, getServerSnapshot);
}

/** Re-reads the session after an action that changes it outside the event bus. */
export function refreshSession(): void {
  emit();
}
