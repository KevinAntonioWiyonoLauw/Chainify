"use client";

/**
 * What the owner actually has in their Pod, at a glance.
 *
 * The dashboard used to describe infrastructure and nothing else, which told an owner
 * with zero listings exactly what it told an owner with twenty. This card reads the
 * four Chainify containers and reports what is in them: how many listings are
 * discoverable, how many evidence claims exist, how many RFQ threads are in flight,
 * and when the public index was last written.
 *
 * Every number comes from the Pod on this render. A container that does not exist yet
 * is a zero, not an error: a fresh Pod is the normal starting point.
 */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { FileJson2, FileText, Handshake, Package, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listEvidence,
  listListings,
  listRfq,
  parsePublicIndex,
  type RepositoryContext,
} from "@/lib/chainify/repository";
import { usePodList } from "@/lib/chainify/use-pod-list";
import { podPaths, type Listing } from "@/lib/chainify/vocab";
import type { PublicIndex } from "@/lib/chainify/models";
import { PodError, readDocument } from "@/lib/solid/resources";

export interface PodSummary {
  listings: number;
  discoverable: number;
  evidence: number;
  rfqOpen: number;
  indexEntries: number;
  indexUpdatedAt: string | null;
  /** True when the index is missing, which is not the same as "empty". */
  indexMissing: boolean;
}

async function readIndex(url: string): Promise<PublicIndex | null> {
  try {
    const raw = await readDocument(url);
    if (raw === null) return null;
    return parsePublicIndex(raw);
  } catch (cause) {
    // A private index is the default, not a failure of the dashboard.
    if (cause instanceof PodError) return null;
    throw cause;
  }
}

export async function loadPodSummary(
  ctx: RepositoryContext,
): Promise<PodSummary> {
  const paths = podPaths(ctx.storage);
  const [listingResult, evidenceResult, buyerResult, sellerResult, index] =
    await Promise.all([
      listListings(ctx).catch(emptyListing),
      listEvidence(ctx).catch(emptyEvidence),
      listRfq(ctx, "buyer").catch(emptyRfq),
      listRfq(ctx, "seller").catch(emptyRfq),
      readIndex(paths.publicIndex),
    ]);

  const threads = [...buyerResult.threads, ...sellerResult.threads];
  return {
    listings: listingResult.listings.length,
    discoverable: listingResult.listings.filter(
      (item: Listing) => item.visibility === "discoverable",
    ).length,
    evidence: evidenceResult.evidence.length,
    rfqOpen: threads.filter((thread) => thread.status !== "agreed" && thread.status !== "declined")
      .length,
    indexEntries: index?.entries.length ?? 0,
    indexUpdatedAt: index?.publishedAt ?? null,
    indexMissing: index === null,
  };
}

function emptyListing(): { listings: never[]; skipped: string[] } {
  return { listings: [], skipped: [] };
}
function emptyEvidence(): { evidence: never[]; skipped: string[] } {
  return { evidence: [], skipped: [] };
}
function emptyRfq(): { threads: never[]; skipped: string[] } {
  return { threads: [], skipped: [] };
}

function Metric({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-control border border-border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="eyebrow">{label}</span>
      <span className="text-2xl leading-none font-medium tabular-nums">
        {value}
      </span>
      <span className="text-caption text-muted-foreground">{detail}</span>
    </Link>
  );
}

export function PodSummaryCard({ ctx }: { ctx: RepositoryContext }) {
  const load = useCallback(() => loadPodSummary(ctx), [ctx]);
  const { value, loading } = usePodList(load, ctx.storage);

  const indexState = useMemo(() => {
    if (!value) return null;
    if (value.indexMissing) {
      return { label: "Belum ditulis", variant: "outline" as const };
    }
    if (value.indexEntries === 0) {
      return { label: "Kosong", variant: "secondary" as const };
    }
    return { label: "Terisi", variant: "default" as const };
  }, [value]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package aria-hidden className="size-4 text-muted-foreground" />
          Isi Pod Anda
        </CardTitle>
        <CardDescription>
          Dibaca langsung dari storage Anda pada render ini, bukan dari cache.
        </CardDescription>
        <CardAction>
          {indexState && (
            <Badge variant={indexState.variant} className="font-normal">
              Index: {indexState.label}
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading || !value ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 w-full rounded-control" />
            <Skeleton className="h-24 w-full rounded-control" />
            <Skeleton className="h-24 w-full rounded-control" />
            <Skeleton className="h-24 w-full rounded-control" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Listing"
              value={value.listings}
              detail={`${value.discoverable} bisa ditemukan`}
              href="/listings"
            />
            <Metric
              label="Bukti"
              value={value.evidence}
              detail="klaim tercatat"
              href="/evidence"
            />
            <Metric
              label="RFQ aktif"
              value={value.rfqOpen}
              detail="belum sepakat/ditolak"
              href="/rfq"
            />
            <Metric
              label="Entri index"
              value={value.indexEntries}
              detail={
                value.indexUpdatedAt
                  ? `diperbarui ${new Date(value.indexUpdatedAt).toLocaleDateString("id-ID")}`
                  : "index belum ada"
              }
              href="/profile"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Link
            href="/listings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileText aria-hidden />
            Kelola listing
          </Link>
          <Link
            href="/discover"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Handshake aria-hidden />
            Cari mitra
          </Link>
          <Link
            href="/evidence"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ShieldCheck aria-hidden />
            Tambah bukti
          </Link>
          <Link
            href="/profile"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <FileJson2 aria-hidden />
            Public index
          </Link>
        </div>

        {value && value.indexEntries === 0 && !value.indexMissing && (
          <p className="text-caption text-muted-foreground">
            Public index ada tetapi kosong: belum ada profil atau listing yang Anda
            tandai discoverable, jadi tidak ada peserta yang bisa menemukan Anda.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
