"use client";

/**
 * One RFQ thread, read straight from the Pod, with its delivery log.
 *
 * The list page shows the negotiation; this page shows the document and every
 * attempt to hand it to the other party. A failed delivery belongs here in full,
 * because "did they receive it?" is the question the sender actually has.
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
import { listRfq, type RepositoryContext } from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import { podPaths, RFQ_STATUS_LABEL } from "@/lib/chainify/vocab";
import { useSolidSession } from "@/lib/solid/use-solid-session";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  sent: "secondary",
  answered: "secondary",
  declined: "destructive",
  agreed: "default",
};

export function RfqDetail({ id }: { id: string }) {
  const session = useSolidSession();
  const owner = useOwner(session);

  const ctx: RepositoryContext | null = useMemo(
    () =>
      owner.status === "ready"
        ? { storage: owner.storage, webId: owner.webId }
        : null,
    [owner],
  );

  // A copy is stored under one role only, so both containers are read and the first
  // match wins. The id is unique per owner, not per role.
  const load = useCallback(async () => {
    if (!ctx) throw new Error("no context");
    const [buyer, seller] = await Promise.all([
      listRfq(ctx, "buyer"),
      listRfq(ctx, "seller"),
    ]);
    return {
      threads: [...buyer.threads, ...seller.threads],
      skipped: [...buyer.skipped, ...seller.skipped],
    };
  }, [ctx]);

  const { value, loading } = usePodList(ctx ? load : null, ctx?.storage ?? "");
  const thread = value?.threads.find((item) => item.id === id) ?? null;
  const url = ctx ? `${podPaths(ctx.storage).rfq}${id}.jsonld` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <Link
            href="/rfq"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-2" })}
          >
            <ArrowLeft aria-hidden />
            RFQ
          </Link>
          <h1>{thread?.subject ?? "Detail RFQ"}</h1>
          <p className="page-lead mt-1.5">
            Salinan Anda, termasuk setiap percobaan pengiriman ke Pod lawan bicara.
          </p>
        </div>
        {thread && (
          <Badge
            variant={STATUS_VARIANT[thread.status] ?? "outline"}
            className="font-normal"
          >
            {RFQ_STATUS_LABEL[thread.status]}
          </Badge>
        )}
      </div>

      <PodGate owner={owner}>
        {() => {
          if (loading) {
            return (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            );
          }

          if (!thread) {
            return (
              <Alert>
                <ArrowLeft aria-hidden />
                <AlertTitle>Thread tidak ditemukan</AlertTitle>
                <AlertDescription>
                  <p>
                    Tidak ada dokumen{" "}
                    <span className="font-mono text-micro">{id}.jsonld</span> di
                    container RFQ Anda.
                  </p>
                  <Link
                    href="/rfq"
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
                  <CardTitle>Isi negosiasi</CardTitle>
                  <CardDescription>
                    Peran salinan ini:{" "}
                    {thread.role === "buyer" ? "pembeli" : "penjual"}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {thread.body && (
                    <p className="text-body text-muted-foreground">{thread.body}</p>
                  )}
                  <div className="flex flex-col">
                    <div className="metric-row">
                      <span className="metric-label">Lawan bicara</span>
                      <span className="metric-value font-mono text-micro break-all">
                        {thread.counterpartyWebId || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Listing terkait</span>
                      <span className="metric-value metric-value-muted">
                        {thread.listingTitle || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Jumlah</span>
                      <span className="metric-value metric-value-muted">
                        {thread.quantityNote || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Tawaran balik</span>
                      <span className="metric-value">
                        {thread.counterOffer || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Kesepakatan</span>
                      <span className="metric-value metric-value-muted">
                        {thread.agreedTerms || "belum ada"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-body">Riwayat pengiriman</CardTitle>
                  <CardDescription>
                    Ditulis di salinan Anda setiap kali tombol kirim ditekan.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {thread.deliveries.length === 0 ? (
                    <p className="text-body text-muted-foreground">
                      Belum pernah dikirim. Salinan ini masih hanya ada di Pod Anda.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {thread.deliveries.map((delivery, index) => (
                        <li
                          key={`${delivery.at}-${index}`}
                          className="flex flex-col gap-1 text-caption"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className={
                                delivery.ok ? "status-dot status-dot-ok" : "status-dot"
                              }
                            />
                            {delivery.ok ? "Diterima" : "Gagal"} ·{" "}
                            {new Date(delivery.at).toLocaleString("id-ID")}
                          </span>
                          <span className="font-mono text-micro break-all text-muted-foreground">
                            {delivery.target}
                          </span>
                          {delivery.detail && (
                            <span className="text-muted-foreground">
                              {delivery.detail}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
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
