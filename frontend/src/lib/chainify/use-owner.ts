"use client";

import { useEffect, useState } from "react";
import { ChainifyApiError, resolveIdentity } from "@/lib/chainify/api";
import type {
  ChainifyErrorCode,
  SolidSessionState,
} from "@/lib/chainify/types";

/**
 * The identity a Pod-writing page needs: the WebID to sign documents with, and the
 * storage root the Chainify containers live under.
 *
 * The node resolves this from the public profile, exactly as the dashboard does, so a
 * page never guesses a storage path. A profile that declares no storage is a real
 * answer, not an error, and is surfaced as `no_storage`.
 */
export type OwnerState =
  | { status: "loading" }
  /**
   * `session-required`: the session restored but now reports anonymous.
   * `session-missing`: the provider sent the browser back without a usable session.
   */
  | { status: "anonymous"; reason: "session-required" | "session-missing" }
  | { status: "no_storage"; webId: string }
  | { status: "error"; code: ChainifyErrorCode; message: string }
  | { status: "ready"; webId: string; storage: string };

/** The resolution result, keyed by WebID so a stale answer for another user is ignored. */
interface Resolved {
  webId: string;
  state: OwnerState;
}

/**
 * True only for an absolute http(s) storage root.
 *
 * The node returns what the public profile declared, and a profile can declare nothing,
 * a relative path, or a value that is not a URL at all. Passing any of those through as
 * `ready` hands every page a storage root that cannot be joined into a request, which
 * surfaces later as an unrelated network failure. It is checked once, here.
 */
function isStorageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return /^https?:\/\/[^\s]+$/i.test(value);
}

export function useOwner(session: SolidSessionState): OwnerState {
  const webId = session.isLoggedIn ? session.webId : undefined;
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!webId) return;
    let cancelled = false;

    resolveIdentity(webId)
      .then((result) => {
        if (cancelled) return;
        const storage = result.storage[0];
        setResolved({
          webId: result.webId,
          state: isStorageUrl(storage)
            ? { status: "ready", webId: result.webId, storage }
            : { status: "no_storage", webId: result.webId },
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setResolved({
          webId,
          state:
            cause instanceof ChainifyApiError
              ? { status: "error", code: cause.code, message: cause.message }
              : {
                  status: "error",
                  code: "unknown",
                  message: "The Pod storage could not be resolved.",
                },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [webId]);

  // Signed out and "still signing in" are both known without asking the node, so they
  // are derived here instead of being written into state from the effect. A session
  // that is not restored yet must not be reported as anonymous: the signed-out notice
  // is a claim about the owner's state, not a loading placeholder.
  if (session.status === "anonymous" || session.status === "loading") {
    return session.status === "anonymous"
      ? { status: "anonymous", reason: "session-required" }
      : { status: "loading" };
  }

  if (!webId) return { status: "anonymous", reason: "session-missing" };
  // An answer for a previous WebID must not be shown while the new one resolves.
  if (resolved && resolved.webId !== webId) return { status: "loading" };

  return resolved?.state ?? { status: "loading" };
}
