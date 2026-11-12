"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { ProtectedNotice } from "@/components/chainify/protected-notice";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { OwnerState } from "@/lib/chainify/use-owner";

interface PodGateProps {
  owner: OwnerState;
  /** Rendered once the Pod storage is resolved. */
  children: (owner: { webId: string; storage: string }) => ReactNode;
}

/**
 * Renders the signed-out notice, the resolution error, or the page body.
 *
 * Every Pod-writing page passes through this so the three failure states read the same
 * way across the app, and so no page can quietly render a form that would write to an
 * unknown storage root.
 */
export function PodGate({ owner, children }: PodGateProps) {
  if (owner.status === "anonymous") {
    return <ProtectedNotice reason={owner.reason} />;
  }

  if (owner.status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-label="Memuat identitas Pod">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (owner.status === "no_storage") {
    return (
      <Alert>
        <Lock aria-hidden />
        <AlertTitle>WebID ini tidak menyatakan Solid storage</AlertTitle>
        <AlertDescription>
          <p>
            Chainify menulis ke storage yang dideklarasikan profil Anda
            (<code>pim:storage</code>). Profil {owner.webId} belum
            menyebutkan alamat yang sah, jadi tidak ada tempat menulis yang
            bisa dipertanggungjawabkan.
          </p>
          <p className="mt-2">
            Kalau profil Anda memang punya storage, muat ulang halaman: nilai
            yang bukan URL absolut diabaikan, bukan ditebak.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (owner.status === "error") {
    return (
      <Alert>
        <Lock aria-hidden />
        <AlertTitle>Storage Pod tidak dapat dibaca</AlertTitle>
        <AlertDescription>
          <p>{owner.message}</p>
          <p className="mt-2">
            Halaman ini tidak menebak lokasi Pod. Perbaiki profil, lalu muat ulang.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children({ webId: owner.webId, storage: owner.storage })}</>;
}
