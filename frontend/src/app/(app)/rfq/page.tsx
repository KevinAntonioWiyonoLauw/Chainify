"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftRight, Check, Send, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/chainify/empty-state";
import { PodGate } from "@/components/chainify/pod-gate";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRfq,
  deliverRfq,
  describeSkipped,
  listRfq,
  saveRfq,
  type RepositoryContext,
  type RfqInput,
} from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import {
  RFQ_STATUS_LABEL,
  type RfqStatus,
  type RfqThread,
} from "@/lib/chainify/vocab";
import { PodError } from "@/lib/solid/resources";
import { useSolidSession } from "@/lib/solid/use-solid-session";

interface Draft {
  id?: string;
  subject: string;
  body: string;
  quantityNote: string;
  counterOffer: string;
  status: RfqStatus;
  counterpartyWebId: string;
  listingRef: string;
  listingTitle: string;
  agreedTerms: string;
  role: RfqThread["role"];
  createdAt?: string;
  deliveries: RfqThread["deliveries"];
}

function emptyDraft(role: RfqThread["role"]): Draft {
  return {
    subject: "",
    body: "",
    quantityNote: "",
    counterOffer: "",
    status: "draft",
    counterpartyWebId: "",
    listingRef: "",
    listingTitle: "",
    agreedTerms: "",
    role,
    deliveries: [],
  };
}

function draftFrom(thread: RfqThread): Draft {
  return {
    id: thread.id,
    subject: thread.subject,
    body: thread.body,
    quantityNote: thread.quantityNote,
    counterOffer: thread.counterOffer,
    status: thread.status,
    counterpartyWebId: thread.counterpartyWebId,
    listingRef: thread.listingRef,
    listingTitle: thread.listingTitle,
    agreedTerms: thread.agreedTerms,
    role: thread.role,
    createdAt: thread.createdAt,
    deliveries: thread.deliveries,
  };
}

function errorText(cause: unknown): string {
  if (cause instanceof PodError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}

const STATUS_VARIANT: Record<
  RfqStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  sent: "secondary",
  answered: "secondary",
  declined: "destructive",
  agreed: "default",
};

const ALL_STATUSES: readonly RfqStatus[] = [
  "draft",
  "sent",
  "answered",
  "declined",
  "agreed",
];

const selectClass =
  "h-control-md w-full rounded-control border border-input bg-(--control) px-2.5 text-body text-foreground shadow-control outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function RfqPage() {
  const session = useSolidSession();
  const owner = useOwner(session);

  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<RfqThread["role"]>("buyer");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const ctx: RepositoryContext | null = useMemo(
    () =>
      owner.status === "ready"
        ? { storage: owner.storage, webId: owner.webId }
        : null,
    [owner],
  );

  const load = useCallback(
    () =>
      ctx ? listRfq(ctx, role) : Promise.reject(new Error("no repository context")),
    [ctx, role],
  );

  const { value, error, loading, reload } = usePodList(
    ctx ? load : null,
    ctx ? `${ctx.storage}#${role}` : "",
  );

  const threads = value?.threads ?? [];
  const skipped = describeSkipped(value?.skipped ?? []);
  const missingContainer = error instanceof PodError && error.kind === "not_found";

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const onSave = async () => {
    if (!ctx || !draft) return;
    if (draft.subject.trim().length === 0) {
      toast.error("Subjek wajib diisi.", {
        description: "Subjek adalah yang dibaca pihak lain lebih dulu.",
      });
      return;
    }
    setBusy(true);
    try {
      const input: RfqInput = {
        id: draft.id,
        subject: draft.subject.trim(),
        body: draft.body,
        quantityNote: draft.quantityNote,
        counterOffer: draft.counterOffer,
        status: draft.status,
        counterpartyWebId: draft.counterpartyWebId.trim(),
        listingRef: draft.listingRef.trim(),
        listingTitle: draft.listingTitle,
        agreedTerms: draft.agreedTerms,
        deliveries: draft.deliveries,
        role: draft.role,
        createdAt: draft.createdAt,
      };
      await saveRfq(ctx, input);
      reload();
      setDraft(null);
      toast.success("RFQ tersimpan di Pod Anda.", {
        description: "Belum terkirim. Pakai tombol kirim di kartu untuk menyalinnya ke Pod lawan bicara.",
      });
    } catch (cause) {
      toast.error("RFQ gagal disimpan.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (thread: RfqThread) => {
    if (!ctx) return;
    setBusy(true);
    try {
      await deleteRfq(ctx, thread.id);
      reload();
      setConfirmId(null);
      toast.success("Thread dihapus dari Pod Anda.");
    } catch (cause) {
      toast.error("Thread gagal dihapus.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onDeliver = async (thread: RfqThread) => {
    if (!ctx) return;
    if (!thread.counterpartyWebId) {
      toast.error("WebID lawan bicara belum diisi.", {
        description:
          "Ubah thread ini dan isi WebID tujuan; Chainify tidak mengirim ke alamat yang belum jelas.",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await deliverRfq(ctx, thread, thread.counterpartyWebId);
      reload();
      if (result.delivered) {
        toast.success("Salinan diterima di inbox lawan bicara.", {
          description: result.delivery.target,
        });
      } else {
        toast.warning("Pengiriman tidak berhasil.", {
          description: result.delivery.detail ?? "Pod tujuan menolak tulisan.",
        });
      }
    } catch (cause) {
      toast.error("Pengiriman gagal.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>RFQ</h1>
          <p className="page-lead mt-1.5">
            Catatan negosiasi yang Anda simpan sendiri. Setiap pihak menyimpan
            salinan di Pod masing-masing; tidak ada server yang memegang
            percakapan.
          </p>
        </div>
        {owner.status === "ready" && (
          <Button
            size="sm"
            onClick={() => setDraft(emptyDraft(role))}
            disabled={draft !== null}
          >
            <Send aria-hidden />
            Thread baru
          </Button>
        )}
      </div>

      <Alert>
        <ArrowLeftRight aria-hidden />
        <AlertTitle>Dua salinan, satu dokumen yang dikirim</AlertTitle>
        <AlertDescription>
          Setiap pihak menyimpan salinan di Pod sendiri; tidak ada server yang
          memegang percakapan. Tombol kirim menulis salinan ke{" "}
          <span className="font-mono text-micro">chainify/inbox/</span> milik lawan
          bicara, dan itu hanya berhasil bila Pod mereka memberi akses tulis. Kalau
          ditolak, penolakan itu dicatat apa adanya di riwayat pengiriman — bukan
          dianggap terkirim.
        </AlertDescription>
      </Alert>

      <div
        className="flex w-fit items-center gap-1 rounded-control border border-border p-1"
        role="group"
        aria-label="Peran salinan"
      >
        {(["buyer", "seller"] as const).map((option) => (
          <Button
            key={option}
            size="sm"
            variant={role === option ? "secondary" : "ghost"}
            aria-pressed={role === option}
            onClick={() => {
              setRole(option);
              setDraft(null);
              setConfirmId(null);
            }}
          >
            {option === "buyer" ? "Sebagai pembeli" : "Sebagai penjual"}
          </Button>
        ))}
      </div>

      <PodGate owner={owner}>
        {() => {
          if (loading) {
            return (
              <div className="grid-cards" aria-label="Memuat RFQ">
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="h-44 w-full rounded-xl" />
              </div>
            );
          }

          return (
            <>
              {error && !missingContainer && (
                <Alert variant="destructive">
                  <ArrowLeftRight aria-hidden />
                  <AlertTitle>RFQ tidak dapat dibaca</AlertTitle>
                  <AlertDescription>
                    <p>{errorText(error)}</p>
                  </AlertDescription>
                </Alert>
              )}

              {skipped.length > 0 && (
                <div className="surface-quiet">
                  <p className="eyebrow">Dokumen dilewati</p>
                  <p className="mt-2 text-body text-muted-foreground">
                    {skipped.length} dokumen gagal dibaca:{" "}
                    <span className="font-mono text-micro">{skipped.join(", ")}</span>
                  </p>
                </div>
              )}

              {draft && (
                <Card>
                  <CardHeader>
                    <CardTitle>{draft.id ? "Ubah thread" : "Thread baru"}</CardTitle>
                    <CardDescription>
                      Salinan ini milik Pod Anda sebagai{" "}
                      {draft.role === "buyer" ? "pembeli" : "penjual"}.
                    </CardDescription>
                    <CardAction>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Tutup formulir"
                        onClick={() => setDraft(null)}
                        disabled={busy}
                      >
                        <X aria-hidden />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="rfq-subject">Subjek</Label>
                      <Input
                        id="rfq-subject"
                        value={draft.subject}
                        onChange={(event) => update("subject", event.target.value)}
                        placeholder="Permintaan 200 kg kopi Arabika"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="rfq-body">Isi</Label>
                      <Textarea
                        id="rfq-body"
                        className="min-h-24"
                        value={draft.body}
                        onChange={(event) => update("body", event.target.value)}
                        placeholder="Mutu yang dicari, waktu pengiriman, dan syarat."
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="rfq-counterparty">WebID lawan bicara</Label>
                        <Input
                          id="rfq-counterparty"
                          value={draft.counterpartyWebId}
                          spellCheck={false}
                          onChange={(event) =>
                            update("counterpartyWebId", event.target.value)
                          }
                          placeholder="https://pod.example/profile/card#me"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="rfq-status">Status salinan ini</Label>
                        <select
                          id="rfq-status"
                          className={selectClass}
                          value={draft.status}
                          onChange={(event) =>
                            update("status", event.target.value as RfqStatus)
                          }
                        >
                          {ALL_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {RFQ_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="rfq-listing-title">Listing terkait</Label>
                        <Input
                          id="rfq-listing-title"
                          value={draft.listingTitle}
                          onChange={(event) =>
                            update("listingTitle", event.target.value)
                          }
                          placeholder="Kopi Arabika Gayo"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="rfq-listing-ref">URL listing</Label>
                        <Input
                          id="rfq-listing-ref"
                          value={draft.listingRef}
                          spellCheck={false}
                          onChange={(event) =>
                            update("listingRef", event.target.value)
                          }
                          placeholder="https://pod.example/chainify/listings/kopi.jsonld"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="rfq-quantity">Catatan jumlah</Label>
                        <Input
                          id="rfq-quantity"
                          value={draft.quantityNote}
                          onChange={(event) =>
                            update("quantityNote", event.target.value)
                          }
                          placeholder="200 kg, kirim dua tahap"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="rfq-counter">Tawaran balik</Label>
                        <Input
                          id="rfq-counter"
                          value={draft.counterOffer}
                          onChange={(event) =>
                            update("counterOffer", event.target.value)
                          }
                          placeholder="Rp 82.000/kg"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="rfq-agreed">Kesepakatan</Label>
                      <Textarea
                        id="rfq-agreed"
                        className="min-h-20"
                        value={draft.agreedTerms}
                        onChange={(event) =>
                          update("agreedTerms", event.target.value)
                        }
                        placeholder="Harga, jumlah, jadwal, dan siapa menanggung ongkos."
                      />
                    </div>

                    <div className="action-rail">
                      <Button onClick={() => void onSave()} disabled={busy}>
                        {busy ? "Menyimpan…" : "Simpan salinan"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setDraft(null)}
                        disabled={busy}
                      >
                        Batal
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {threads.length === 0 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title="Belum ada thread"
                  description="Tidak ada RFQ tersimpan untuk peran ini. Thread baru dicatat di Pod Anda sendiri, sejak awal sebagai draf."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraft(emptyDraft(role))}
                      disabled={draft !== null}
                    >
                      <Send aria-hidden />
                      Buat thread
                    </Button>
                  }
                />
              ) : (
                <div className="grid-cards">
                  {threads.map((thread) => (
                    <Card key={thread.id} size="sm">
                      <CardHeader>
                        <CardTitle>{thread.subject}</CardTitle>
                        <CardDescription>
                          {thread.listingTitle || "Tanpa listing terkait"}
                        </CardDescription>
                        <CardAction>
                          <Badge
                            variant={STATUS_VARIANT[thread.status]}
                            className="font-normal"
                          >
                            {RFQ_STATUS_LABEL[thread.status]}
                          </Badge>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        {thread.body && (
                          <p className="text-body text-muted-foreground">
                            {thread.body}
                          </p>
                        )}

                        <div className="flex flex-col">
                          <div className="metric-row">
                            <span className="metric-label">Lawan bicara</span>
                            <span className="metric-value">
                              {thread.counterpartyWebId || "—"}
                            </span>
                          </div>
                          {thread.quantityNote && (
                            <div className="metric-row">
                              <span className="metric-label">Jumlah</span>
                              <span className="metric-value metric-value-muted">
                                {thread.quantityNote}
                              </span>
                            </div>
                          )}
                          {thread.counterOffer && (
                            <div className="metric-row">
                              <span className="metric-label">Tawaran balik</span>
                              <span className="metric-value">
                                {thread.counterOffer}
                              </span>
                            </div>
                          )}
                          <div className="metric-row">
                            <span className="metric-label">Diperbarui</span>
                            <span className="metric-value metric-value-muted">
                              {thread.updatedAt
                                ? new Date(thread.updatedAt).toLocaleString("id-ID")
                                : "—"}
                            </span>
                          </div>
                        </div>

                        {thread.agreedTerms && (
                          <div className="rounded-control border border-border bg-muted p-3">
                            <p className="eyebrow flex items-center gap-1.5">
                              <Check aria-hidden className="size-3" />
                              Kesepakatan
                            </p>
                            <p className="mt-1.5 text-caption">{thread.agreedTerms}</p>
                          </div>
                        )}

                        {thread.deliveries.length > 0 && (
                          <div className="rounded-control border border-border p-3">
                            <p className="eyebrow">Riwayat pengiriman</p>
                            <ul className="mt-2 flex flex-col gap-2">
                              {thread.deliveries.map((delivery, index) => (
                                <li
                                  key={`${delivery.at}-${index}`}
                                  className="flex flex-col gap-0.5 text-caption"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      aria-hidden
                                      className={
                                        delivery.ok
                                          ? "status-dot status-dot-ok"
                                          : "status-dot"
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
                          </div>
                        )}

                        {confirmId === thread.id ? (
                          <div className="flex flex-col gap-2 border-t border-border pt-3">
                            <p className="text-caption">
                              Hapus salinan ini dari Pod Anda?
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void onDelete(thread)}
                                disabled={busy}
                              >
                                Ya, hapus
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmId(null)}
                                disabled={busy}
                              >
                                Batal
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="action-rail">
                            <Link
                              href={`/rfq/${encodeURIComponent(thread.id)}`}
                              className={buttonVariants({ variant: "secondary", size: "sm" })}
                            >
                              Detail
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDraft(draftFrom(thread));
                                setConfirmId(null);
                              }}
                            >
                              Ubah
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void onDeliver(thread)}
                              disabled={busy || !thread.counterpartyWebId}
                              title={
                                thread.counterpartyWebId
                                  ? undefined
                                  : "Isi WebID lawan bicara untuk mengirim"
                              }
                            >
                              <Send aria-hidden />
                              Kirim ke inbox
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmId(thread.id)}
                            >
                              <Trash2 aria-hidden />
                              Hapus
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </PodGate>
    </div>
  );
}
