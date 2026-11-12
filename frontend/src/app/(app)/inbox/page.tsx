"use client";

/**
 * The receiving half of the RFQ flow.
 *
 * Deliveries land in `chainify/inbox/` and, without this page, sat there unread: a peer
 * could send and the owner had no way to see it. This page is that way.
 *
 * Three things it is careful about:
 *
 *  - It shows the whole inbox, because it reads with the owner's own session. The ACL on
 *    the container only lets peers *append*; the owner still sees everything.
 *  - Opening the inbox is an explicit action, not a silent default. Granting "any
 *    authenticated agent may drop documents here" is a real decision and it is presented
 *    as one, with the result reported honestly.
 *  - A document is claimed by copying it into `rfq/` under the same id. The inbox copy is
 *    never moved or deleted, because the sender's delivery log points at that URL.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftRight, Inbox as InboxIcon, Lock, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/chainify/empty-state";
import { PodGate } from "@/components/chainify/pod-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  claimInboxEntry,
  describeSkipped,
  listInbox,
  openInbox,
  type RepositoryContext,
} from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import { RFQ_STATUS_LABEL } from "@/lib/chainify/vocab";
import { PodError, type AclShareResult } from "@/lib/solid/resources";
import { useSolidSession } from "@/lib/solid/use-solid-session";

function errorText(cause: unknown): string {
  if (cause instanceof PodError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}

const ACL_MESSAGE: Record<
  Exclude<AclShareResult, "created" | "already-present">,
  { title: string; body: string }
> = {
  unsupported: {
    title: "Penyedia Pod ini tidak mengekspos WAC.",
    body: "Inbox tetap bisa Anda baca, tapi pihak lain tidak bisa menulis ke sini sampai Anda mengatur berbagi lewat panel penyedia.",
  },
  "no-control": {
    title: "Anda tidak punya izin mengubah ACL inbox.",
    body: "Tanpa hak control Anda tidak bisa membuka inbox untuk pengirim. Minta pemilik storage memberi Anda hak tersebut.",
  },
};

export default function InboxPage() {
  const session = useSolidSession();
  const owner = useOwner(session);

  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);

  const ctx: RepositoryContext | null = useMemo(
    () =>
      owner.status === "ready"
        ? { storage: owner.storage, webId: owner.webId }
        : null,
    [owner],
  );

  const load = useCallback(
    () => (ctx ? listInbox(ctx) : Promise.reject(new Error("no repository context"))),
    [ctx],
  );

  const { value, error, loading, reload } = usePodList(
    ctx ? load : null,
    ctx?.storage ?? "",
  );

  const entries = value?.entries ?? [];
  const skipped = describeSkipped(value?.skipped ?? []);
  const missingContainer = error instanceof PodError && error.kind === "not_found";
  const unread = entries.filter((entry) => !entry.claimed).length;

  const onOpenInbox = async () => {
    if (!ctx) return;
    setOpening(true);
    try {
      const result = await openInbox(ctx);
      if (result === "created" || result === "already-present") {
        toast.success(
          result === "created"
            ? "Inbox dibuka untuk pengirim."
            : "Inbox memang sudah terbuka.",
          {
            description:
              "Setiap agen terautentikasi boleh menambah dokumen. Membaca isi inbox tetap hanya milik Anda.",
          },
        );
      } else {
        const message = ACL_MESSAGE[result];
        toast.warning(message.title, { description: message.body });
      }
    } catch (cause) {
      toast.error("Inbox gagal dibuka.", { description: errorText(cause) });
    } finally {
      setOpening(false);
    }
  };

  const onClaim = async (entryId: string) => {
    if (!ctx) return;
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    setBusy(true);
    try {
      await claimInboxEntry(ctx, entry);
      reload();
      toast.success("Salinan diambil ke thread RFQ Anda.", {
        description:
          "Dokumen di inbox tetap di tempatnya, karena log pengiriman pengirim menunjuk ke sana.",
      });
    } catch (cause) {
      toast.error("Gagal mengambil dokumen dari inbox.", {
        description: errorText(cause),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Inbox</h1>
          <p className="page-lead mt-1.5">
            Dokumen yang dikirim pihak lain ke Pod Anda. Tidak ada server yang
            menyimpannya: ini container Anda sendiri.
            {unread > 0 && ` ${unread} belum Anda ambil.`}
          </p>
        </div>
        {owner.status === "ready" && (
          <Button size="sm" variant="outline" onClick={() => void onOpenInbox()} disabled={opening}>
            <Lock aria-hidden />
            {opening ? "Membuka…" : "Buka inbox untuk pengirim"}
          </Button>
        )}
      </div>

      <Alert>
        <ShieldCheck aria-hidden />
        <AlertTitle>Kirim boleh, baca jangan</AlertTitle>
        <AlertDescription>
          Saat dibuka, inbox hanya memberi izin <em>tambah</em> kepada agen
          terautentikasi. Mereka tidak bisa membaca isi inbox, dan tidak bisa menimpa
          dokumen yang bukan miliknya. Isi inbox hanya terbaca oleh Anda.
        </AlertDescription>
      </Alert>

      <PodGate owner={owner}>
        {() => {
          if (loading) {
            return (
              <div className="grid-cards" aria-label="Memuat inbox">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            );
          }

          if (error && !missingContainer) {
            return (
              <Alert>
                <InboxIcon aria-hidden />
                <AlertTitle>Inbox tidak dapat dibaca</AlertTitle>
                <AlertDescription>{errorText(error)}</AlertDescription>
              </Alert>
            );
          }

          if (entries.length === 0) {
            return (
              <EmptyState
                icon={InboxIcon}
                title="Inbox kosong"
                description={
                  missingContainer
                    ? "Container inbox belum ada. Buka inbox untuk pengirim agar pihak lain bisa mengirim RFQ ke sini."
                    : "Belum ada yang mengirim ke Pod ini. Dokumen akan muncul di sini setelah pengirim berhasil menulis."
                }
              />
            );
          }

          return (
            <div className="flex flex-col gap-4">
              {/* A skipped document never hides the ones that did parse. */}
              {skipped.length > 0 && (
                <Alert>
                  <InboxIcon aria-hidden />
                  <AlertTitle>Sebagian dokumen tidak bisa dibaca</AlertTitle>
                  <AlertDescription>
                    Dilewati: <span className="font-mono text-micro">{skipped.join(", ")}</span>.
                    Sisanya tetap ditampilkan.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid-cards">
              {entries.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1.5 font-normal">
                        <span
                          aria-hidden
                          className={entry.claimed ? "status-dot status-dot-ok" : "status-dot"}
                        />
                        {entry.claimed ? "Sudah diambil" : "Belum diambil"}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {RFQ_STATUS_LABEL[entry.thread.status]}
                      </Badge>
                    </div>
                    <CardTitle className="mt-1">{entry.thread.subject || "(tanpa subjek)"}</CardTitle>
                    <CardDescription className="break-all font-mono text-micro">
                      dari {entry.thread.counterpartyWebId || "pengirim tidak dikenal"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {entry.thread.body && (
                      <p className="text-body text-muted-foreground">{entry.thread.body}</p>
                    )}

                    <div className="flex flex-col">
                      <div className="metric-row">
                        <span className="metric-label">Listing terkait</span>
                        <span className="metric-value metric-value-muted">
                          {entry.thread.listingTitle || "—"}
                        </span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Jumlah</span>
                        <span className="metric-value metric-value-muted">
                          {entry.thread.quantityNote || "—"}
                        </span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Diterima</span>
                        <span className="metric-value metric-value-muted">
                          {entry.thread.updatedAt
                            ? new Date(entry.thread.updatedAt).toLocaleString("id-ID")
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="action-rail">
                      <Button
                        size="sm"
                        onClick={() => void onClaim(entry.id)}
                        disabled={busy || entry.claimed}
                      >
                        <ArrowLeftRight aria-hidden />
                        {entry.claimed ? "Sudah di thread" : "Ambil ke thread RFQ"}
                      </Button>
                      {entry.claimed && (
                        <Link
                          href={`/rfq/${encodeURIComponent(entry.id)}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Buka thread
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            </div>
          );
        }}
      </PodGate>
    </div>
  );
}
