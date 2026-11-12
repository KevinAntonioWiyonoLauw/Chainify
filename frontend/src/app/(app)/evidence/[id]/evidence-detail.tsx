"use client";

/**
 * One evidence document, read straight from the Pod.
 *
 * A trust claim is only worth as much as the document behind it, so this page shows
 * both the parsed fields and the bytes. It deliberately does not add a score or a
 * checkmark: Chainify reads claims, it does not certify them.
 */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocumentViewer } from "@/components/chainify/document-viewer";
import { PodGate } from "@/components/chainify/pod-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listEvidence, type RepositoryContext } from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import { podPaths } from "@/lib/chainify/vocab";
import { useSolidSession } from "@/lib/solid/use-solid-session";

export function EvidenceDetail({ id }: { id: string }) {
  const session = useSolidSession();
  const owner = useOwner(session);

  const ctx: RepositoryContext | null = useMemo(
    () =>
      owner.status === "ready"
        ? { storage: owner.storage, webId: owner.webId }
        : null,
    [owner],
  );

  const load = useCallback(
    () => (ctx ? listEvidence(ctx) : Promise.reject(new Error("no context"))),
    [ctx],
  );

  const { value, loading } = usePodList(ctx ? load : null, ctx?.storage ?? "");
  const credential = value?.evidence.find((item) => item.id === id) ?? null;
  const url = ctx ? `${podPaths(ctx.storage).evidence}${id}.jsonld` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <Link
            href="/evidence"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-2" })}
          >
            <ArrowLeft aria-hidden />
            Bukti
          </Link>
          <h1>{credential?.title ?? "Detail bukti"}</h1>
          <p className="page-lead mt-1.5">
            Klaim beserta dokumennya. Chainify mencatat, bukan mengesahkan.
          </p>
        </div>
        {credential && (
          <Badge
            variant={credential.visibility === "discoverable" ? "default" : "outline"}
            className="font-normal"
          >
            {credential.visibility === "discoverable" ? "Discoverable" : "Privat"}
          </Badge>
        )}
      </div>

      <PodGate owner={owner}>
        {() => {
          if (loading) {
            return (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            );
          }

          if (!credential) {
            return (
              <Alert>
                <ArrowLeft aria-hidden />
                <AlertTitle>Bukti tidak ditemukan</AlertTitle>
                <AlertDescription>
                  <p>
                    Tidak ada dokumen{" "}
                    <span className="font-mono text-micro">{id}.jsonld</span> di
                    container bukti Anda.
                  </p>
                  <Link
                    href="/evidence"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "mt-3",
                    })}
                  >
                    Kembali ke daftar
                  </Link>
                </AlertDescription>
              </Alert>
            );
          }

          return (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Klaim</CardTitle>
                  <CardDescription>
                    Satu klaim, satu dokumen. Klaim gabungan sebaiknya dipecah.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-body">{credential.claim}</p>
                  <div className="flex flex-col">
                    <div className="metric-row">
                      <span className="metric-label">Penerbit</span>
                      <span className="metric-value">
                        {credential.issuer || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Subjek</span>
                      <span className="metric-value metric-value-muted font-mono text-micro break-all">
                        {credential.subject || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Diterbitkan</span>
                      <span className="metric-value metric-value-muted">
                        {credential.issuedAt || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Berlaku sampai</span>
                      <span className="metric-value metric-value-muted">
                        {credential.expiresAt || "tanpa batas"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Dibagikan ke</span>
                      <span className="metric-value metric-value-muted">
                        {credential.sharedWith.length > 0
                          ? `${credential.sharedWith.length} WebID`
                          : "belum ada"}
                      </span>
                    </div>
                  </div>
                  {credential.notes && (
                    <p className="text-caption text-muted-foreground">
                      {credential.notes}
                    </p>
                  )}
                </CardContent>
              </Card>

              <DocumentViewer url={url} title="JSON-LD" />

              <div className="action-rail">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLink aria-hidden />
                  Buka URL resource
                </a>
              </div>
            </>
          );
        }}
      </PodGate>
    </div>
  );
}
