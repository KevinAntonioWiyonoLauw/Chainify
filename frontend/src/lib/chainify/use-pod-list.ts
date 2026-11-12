"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Reads a list from the owner's Pod once per repository context, and again on `reload`.
 *
 * The loading flag is derived by comparing the run key the data settled for against the
 * current one, so a reload is immediately visible without the effect ever calling
 * setState in its body — the cascade the React lint rule exists to prevent.
 */
export function usePodList<T>(
  load: (() => Promise<T>) | null,
  key: string,
) {
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((current) => current + 1), []);
  const runKey = `${key}#${nonce}`;

  useEffect(() => {
    if (!load) return;
    // The hook's contract is "ignore a result that arrives after unmount"; the caller's
    // load has no reason to hold an AbortSignal of its own.
    let cancelled = false;

    load()
      .then((result) => {
        if (cancelled) return;
        setValue(result);
        setError(null);
        setSettledFor(`${key}#${nonce}`);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setValue(null);
        setError(cause);
        setSettledFor(`${key}#${nonce}`);
      });

    return () => {
      cancelled = true;
    };
  }, [load, key, nonce]);

  return {
    value,
    error,
    loading: settledFor !== runKey,
    reload,
  };
}
