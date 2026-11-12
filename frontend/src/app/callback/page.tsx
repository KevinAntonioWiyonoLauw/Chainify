"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { ChainifyLogo } from "@/components/chainify/chainify-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { completeRedirect, takeReturnPath } from "@/lib/solid/session";

type CallbackState = "working" | "failed";

/**
 * Module-level guard. A ref is not enough here: this page is mounted twice
 * during the redirect (the history entry is rewritten between mounts), and each
 * mount creates a new component instance with a fresh `ref.current`. The second
 * mount would then call `handleIncomingRedirect` again, on an address bar that no
 * longer carries `code`/`state`, and the page would wait forever. The promise is
 * shared across mounts so both observers see the one real exchange.
 */
let redirectPromise: Promise<{
  session: Awaited<ReturnType<typeof completeRedirect>>;
  returnPath: string | null;
}> | null = null;

/**
 * Captures the return path before the exchange runs.
 *
 * `handleIncomingRedirect` clears `solidClientAuthn:currentUrl` as soon as it recognises
 * the incoming code, which is the only place the page that started the sign-in is
 * recorded. Reading it afterwards yields `null`, so it is taken up front and carried
 * alongside the result.
 */
function redirectOnce() {
  redirectPromise ??= (async () => {
    const returnPath = takeReturnPath(window.location.origin);
    const session = await completeRedirect();
    return { session, returnPath };
  })();
  return redirectPromise;
}

export default function CallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<CallbackState>("working");
  const [message, setMessage] = useState<string>(
    "Completing the Solid-OIDC handshake…",
  );

  useEffect(() => {
    let cancelled = false;
    redirectOnce()
      .then(({ session, returnPath }) => {
        if (cancelled) return;
        if (session.isLoggedIn) {
          // Back to the page the sign-in started from; the dashboard when the login
          // began on /login itself, which is the only place without one.
          router.replace(returnPath ?? "/dashboard");
          return;
        }
        setState("failed");
        setMessage(
          "The identity provider returned without an active session. This can happen when consent was declined or the sign-in was started in another tab.",
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState("failed");
        setMessage(
          cause instanceof Error
            ? cause.message
            : "The sign-in response could not be processed.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-12">
      <Link
        href="/"
        aria-label="Chainify home"
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChainifyLogo />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state === "working" ? (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
            ) : (
              <TriangleAlert className="size-4 text-destructive" aria-hidden />
            )}
            {state === "working" ? "Finishing sign-in" : "Sign-in interrupted"}
          </CardTitle>
          <CardDescription>
            Securely completing the Solid-OIDC handshake with your provider.
          </CardDescription>
        </CardHeader>
        <CardContent aria-live="polite">
          {state === "working" ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <p className="text-body text-muted-foreground">{message}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertTitle>Sign-in did not complete</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/login" />}>
                Return to sign in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
