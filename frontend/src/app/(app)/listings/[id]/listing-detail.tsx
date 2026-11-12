"use client";

/**
 * One listing, read straight from the Pod.
 *
 * The list page is for scanning; this page is for the document itself. It keeps the
 * resource URL in the route so the address bar *is* the thing being shown, and a peer
 * can be handed the link that leads to the bytes.
 *
 * The document lives in the Pod, so the id arrives as a prop and everything else is
 * resolved on the client; `page.tsx` is the hook-free shell that supplies it.
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
import { listListings, type RepositoryContext } from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import { podPaths } from "@/lib/chainify/vocab";
import { useSolidSession } from "@/lib/solid/use-solid-session";

export function ListingDetail({ id }: { id: string }) {
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
    () => (ctx ? listListings(ctx) : Promise.reject(new Error("no context"))),
    [ctx],
  );

  const { value, loading } = usePodList(ctx ? load : null, ctx?.storage ?? "");
  const listing = value?.listings.find((item) => item.id === id) ?? null;
  const url = ctx ? `${podPaths(ctx.storage).listings}${id}.jsonld` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <Link
            href="/listings"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-2" })}
          >
            <ArrowLeft aria-hidden />
            Listing
          </Link>
          <h1>{listing?.title ?? "Detail listing"}</h1>
          <p className="page-lead mt-1.5">
            Dokumen yang sama yang dibaca discovery, hanya tanpa lapisan tampilan.
          </p>
        </div>
        {listing && (
          <Badge
            variant={listing.visibility === "discoverable" ? "default" : "outline"}
            className="font-normal"
          >
            {listing.visibility === "discoverable" ? "Discoverable" : "Privat"}
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

          if (!listing) {
            return (
              <Alert>
                <ArrowLeft aria-hidden />
                <AlertTitle>Listing tidak ditemukan</AlertTitle>
                <AlertDescription>
                  <p>
                    Tidak ada dokumen{" "}
                    <span className="font-mono text-micro">{id}.jsonld</span> di
                    container listing Anda. Mungkin sudah dihapus.
                  </p>
                  <Link
                    href="/listings"
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
                  <CardTitle>Ringkasan</CardTitle>
                  <CardDescription>
                    Yang dibaca Chainify dari dokumen tanpa mengubah isinya.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col">
                  <div className="metric-row">
                    <span className="metric-label">Jenis</span>
                    <span className="metric-value">
                      {listing.kind === "offer" ? "Penawaran" : "Permintaan"}
                    </span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Kategori</span>
                    <span className="metric-value metric-value-muted">
                      {listing.category || "—"}
                    </span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Jumlah</span>
                    <span className="metric-value">
                      {listing.quantity
                        ? `${listing.quantity} ${listing.unit}`.trim()
                        : "—"}
                    </span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Harga</span>
                    <span className="metric-value">
                      {listing.price
                        ? `${listing.price} ${listing.currency}`
                        : "—"}
                    </span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Lokasi</span>
                    <span className="metric-value metric-value-muted">
                      {listing.location || "—"}
                    </span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Diperbarui</span>
                    <span className="metric-value metric-value-muted">
                      {listing.updatedAt
                        ? new Date(listing.updatedAt).toLocaleString("id-ID")
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {listing.description && (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="text-body">Deskripsi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-body text-muted-foreground">
                      {listing.description}
                    </p>
                  </CardContent>
                </Card>
              )}

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
