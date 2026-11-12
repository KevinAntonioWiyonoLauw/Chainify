"use client";

import { Button } from "@/components/ui/button";
import { logout } from "@/lib/solid/session";
import { useSolidSession } from "@/lib/solid/use-solid-session";

function webIdHost(webId: string): string {
  try {
    return new URL(webId).host;
  } catch {
    return webId;
  }
}

export function SessionBadge() {
  const state = useSolidSession();

  // `loading` is its own state: showing "Not signed in" while the session is still
  // being restored would be a wrong answer, not a conservative one.
  if (state.status === "loading") {
    return (
      <span
        aria-hidden
        className="hidden h-4 w-24 animate-pulse rounded-sm bg-muted min-[22rem]:inline-block motion-reduce:animate-none"
      />
    );
  }

  if (!state.isLoggedIn || !state.webId) {
    return (
      <span className="hidden text-caption whitespace-nowrap text-muted-foreground min-[22rem]:inline">
        Not signed in
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="hidden max-w-40 truncate font-mono text-mono-micro text-muted-foreground md:block"
        title={state.webId}
      >
        {webIdHost(state.webId)}
      </span>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          void logout();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
