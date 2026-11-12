"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileCheck2,
  Plus,
  Share2,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
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
  deleteEvidence,
  describeSkipped,
  listEvidence,
  removeShare,
  recordShare,
  saveEvidence,
  type EvidenceInput,
  type RepositoryContext,
} from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import type { EvidenceCredential } from "@/lib/chainify/vocab";
import {
  PodError,
  revokeAgentShares,
  shareWithAgent,
  type AclShareResult,
} from "@/lib/solid/resources";
import { useSolidSession } from "@/lib/solid/use-solid-session";

interface Draft {
  id?: string;
  title: string;
  claim: string;
  issuer: string;
  subject: string;
  issuedAt: string;
  expiresAt: string;
  notes: string;
  visibility: EvidenceCredential["visibility"];
  createdAt?: string;
}

const EMPTY_DRAFT: Draft = {
  title: "",
  claim: "",
  issuer: "",
  subject: "",
  issuedAt: "",
  expiresAt: "",
  notes: "",
  visibility: "private",
};

function draftFrom(evidence: EvidenceCredential): Draft {
  return {
    id: evidence.id,
    title: evidence.title,
    claim: evidence.claim,
    issuer: evidence.issuer,
    subject: evidence.subject,
    issuedAt: evidence.issuedAt,
    expiresAt: evidence.expiresAt,
    notes: evidence.notes,
    visibility: evidence.visibility,
    createdAt: evidence.createdAt,
  };
}

function errorText(cause: unknown): string {
  if (cause instanceof PodError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}

/** Turns the Pod ACL answer into a sentence that cannot overstate what happened. */
const SHARE_RESULT_TEXT: Record<AclShareResult, string> = {
  created:
    "Dokumen ditandai untuk WebID itu dan aturan baca ditambahkan ke .acl resource.",
  "already-present":
    "Dokumen ditandai untuk WebID itu. .acl resource sudah ada; periksa di Pod bahwa aturannya memang memuat agen ini.",
  unsupported:
    "Nama tercatat di dokumen, tetapi Pod ini tidak menyediakan .acl resource. Tanpa itu akses baca belum diberikan: atur manual di Pod.",
  "no-control":
    "Nama tercatat di dokumen, tetapi akun Anda tidak memegang kendali ACL atas resource ini, jadi aturan baca tidak bisa ditulis.",
};

export default function EvidencePage() {
  const session = useSolidSession();
  const owner = useOwner(session);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    id: string;
    webId: string;
  } | null>(null);
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
      ctx
        ? listEvidence(ctx)
        : Promise.reject(new Error("no repository context")),
    [ctx],
  );

  const { value, error, loading, reload } = usePodList(
    ctx ? load : null,
    ctx?.storage ?? "",
  );

  const evidence = value?.evidence ?? [];
  const skipped = describeSkipped(value?.skipped ?? []);
  const missingContainer = error instanceof PodError && error.kind === "not_found";

  const onSave = async () => {
    if (!ctx || !draft) return;
    if (draft.title.trim().length === 0 || draft.claim.trim().length === 0) {
      toast.error("Judul dan klaim wajib diisi.", {
        description: "Satu dokumen hanya boleh memuat satu klaim.",
      });
      return;
    }
    setBusy(true);
    try {
      const input: EvidenceInput = {
        id: draft.id,
        title: draft.title.trim(),
        claim: draft.claim.trim(),
        issuer: draft.issuer,
        subject: draft.subject || ctx.webId,
        issuedAt: draft.issuedAt,
        expiresAt: draft.expiresAt,
        notes: draft.notes,
        visibility: draft.visibility,
        createdAt: draft.createdAt,
      };
      await saveEvidence(ctx, input);
      reload();
      setDraft(null);
      toast.success(draft.id ? "Bukti diperbarui." : "Bukti dicatat di Pod.");
    } catch (cause) {
      toast.error("Bukti gagal disimpan.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onShare = async (item: EvidenceCredential) => {
    if (!ctx || !shareTarget || shareTarget.id !== item.id) return;
    const agentWebId = shareTarget.webId.trim();
    if (!/^https?:\/\//.test(agentWebId)) {
      toast.error("WebID harus berupa URL lengkap.");
      return;
    }
    setBusy(true);
    try {
      // Two separate steps, in this order: the intent is written into the document
      // first, then the Pod-level ACL is attempted. A share that only half lands is
      // reported as such, never shown as complete.
      await recordShare(ctx, item.id, agentWebId);
      const aclResult = await shareWithAgent(item.sourceUrl, agentWebId);
      reload();
      setShareTarget(null);
      const honest = SHARE_RESULT_TEXT[aclResult];
      if (aclResult === "created" || aclResult === "already-present") {
        toast.success("Akses dibagikan.", { description: honest });
      } else {
        toast.warning("Akses belum sepenuhnya diberikan.", {
          description: honest,
        });
      }
    } catch (cause) {
      toast.error("Berbagi gagal.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (item: EvidenceCredential, agentWebId: string) => {
    if (!ctx) return;
    setBusy(true);
    try {
      const remaining = item.sharedWith.filter((entry) => entry !== agentWebId);
      // Removing the last name also drops the resource ACL, which is the only moment a
      // Pod-level grant can actually be withdrawn.
      if (remaining.length === 0) await revokeAgentShares(item.sourceUrl);
      await removeShare(ctx, item.id, agentWebId);
      reload();
      toast.success("Nama dihapus dari daftar berbagi.", {
        description:
          "Salinan yang sudah diunduh pihak lain tetap ada di luar Pod ini.",
      });
    } catch (cause) {
      toast.error("Pencabutan gagal.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (item: EvidenceCredential) => {
    if (!ctx) return;
    setBusy(true);
    try {
      await revokeAgentShares(item.sourceUrl);
      await deleteEvidence(ctx, item.id);
      reload();
      setConfirmId(null);
      toast.success("Bukti dihapus dari Pod.");
    } catch (cause) {
      toast.error("Bukti gagal dihapus.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Bukti</h1>
          <p className="page-lead mt-1.5">
            Catatan klaim beserta penerbitnya, disimpan sebagai dokumen di Pod
            Anda. Dibagikan hanya ke WebID yang Anda sebut satu per satu.
          </p>
        </div>
        {owner.status === "ready" && (
          <Button
            size="sm"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            disabled={draft !== null}
          >
            <Plus aria-hidden />
            Bukti baru
          </Button>
        )}
      </div>

      <Alert>
        <ShieldAlert aria-hidden />
        <AlertTitle>Yang dicatat Chainify, dan yang tidak diverifikasi</AlertTitle>
        <AlertDescription>
          Tidak ada badan penerbit kredensial yang diakui pada prototipe ini. Nama
          penerbit yang Anda tulis adalah teks yang Anda nyatakan, bukan hasil
          pemeriksaan. Chainify tidak memverifikasi tanda tangan dan tidak
          menghubungi penerbitnya.
        </AlertDescription>
      </Alert>

      <PodGate owner={owner}>
        {() => {
          if (loading) {
            return (
              <div className="grid-cards" aria-label="Memuat bukti">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            );
          }

          return (
            <>
              {error && !missingContainer && (
                <Alert variant="destructive">
                  <FileCheck2 aria-hidden />
                  <AlertTitle>Bukti tidak dapat dibaca</AlertTitle>
                  <AlertDescription>
                    <p>{errorText(error)}</p>
                  </AlertDescription>
                </Alert>
              )}

              {skipped.length > 0 && (
                <div className="surface-quiet">
                  <p className="eyebrow">Dokumen dilewati</p>
                  <p className="mt-2 text-body text-muted-foreground">
                    {skipped.length} dokumen gagal dibaca dan tidak ditampilkan:{" "}
                    <span className="font-mono text-micro">{skipped.join(", ")}</span>
                  </p>
                </div>
              )}

              {draft && (
                <Card>
                  <CardHeader>
                    <CardTitle>{draft.id ? "Ubah bukti" : "Bukti baru"}</CardTitle>
                    <CardDescription>
                      Satu dokumen memuat satu klaim. Kalau klaimnya dua, buat dua
                      dokumen.
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
                      <Label htmlFor="evidence-title">Judul</Label>
                      <Input
                        id="evidence-title"
                        value={draft.title}
                        onChange={(event) =>
                          setDraft({ ...draft, title: event.target.value })
                        }
                        placeholder="Sertifikat organik 2026"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="evidence-claim">Klaim</Label>
                      <Textarea
                        id="evidence-claim"
                        className="min-h-20"
                        value={draft.claim}
                        onChange={(event) =>
                          setDraft({ ...draft, claim: event.target.value })
                        }
                        placeholder="Lahan seluas 4 ha tersertifikasi organik hingga Desember 2026."
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="evidence-issuer">Penerbit</Label>
                        <Input
                          id="evidence-issuer"
                          value={draft.issuer}
                          onChange={(event) =>
                            setDraft({ ...draft, issuer: event.target.value })
                          }
                          placeholder="Lembaga sertifikasi"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="evidence-subject">Subjek</Label>
                        <Input
                          id="evidence-subject"
                          value={draft.subject}
                          spellCheck={false}
                          onChange={(event) =>
                            setDraft({ ...draft, subject: event.target.value })
                          }
                          placeholder="Kosongkan untuk WebID Anda"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="evidence-issued">Terbit</Label>
                        <Input
                          id="evidence-issued"
                          type="date"
                          value={draft.issuedAt.slice(0, 10)}
                          onChange={(event) =>
                            setDraft({ ...draft, issuedAt: event.target.value })
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="evidence-expires">Berakhir</Label>
                        <Input
                          id="evidence-expires"
                          type="date"
                          value={draft.expiresAt.slice(0, 10)}
                          onChange={(event) =>
                            setDraft({ ...draft, expiresAt: event.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="evidence-notes">Catatan</Label>
                      <Textarea
                        id="evidence-notes"
                        className="min-h-20"
                        value={draft.notes}
                        onChange={(event) =>
                          setDraft({ ...draft, notes: event.target.value })
                        }
                        placeholder="Nomor dokumen, cakupan, dan batasannya."
                      />
                    </div>

                    <label
                      htmlFor="evidence-discoverable"
                      className="flex items-start gap-3 rounded-control border border-border p-3"
                    >
                      <input
                        id="evidence-discoverable"
                        type="checkbox"
                        className="mt-0.5 size-4 accent-(--primary)"
                        checked={draft.visibility === "discoverable"}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            visibility: event.target.checked
                              ? "discoverable"
                              : "private",
                          })
                        }
                      />
                      <span className="flex flex-col gap-1">
                        <span className="text-body font-medium text-foreground">
                          Tandai bisa ditemukan
                        </span>
                        <span className="text-caption text-muted-foreground">
                          Bukti tidak pernah masuk public index. Penanda ini hanya
                          mencatat niat Anda di dokumen.
                        </span>
                      </span>
                    </label>

                    <div className="action-rail">
                      <Button onClick={() => void onSave()} disabled={busy}>
                        {busy ? "Menyimpan…" : "Simpan ke Pod"}
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

              {evidence.length === 0 ? (
                <EmptyState
                  icon={FileCheck2}
                  title="Belum ada bukti"
                  description="Container bukti di Pod Anda masih kosong. Catat satu klaim, lalu bagikan ke mitra tertentu saja."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraft({ ...EMPTY_DRAFT })}
                      disabled={draft !== null}
                    >
                      <Plus aria-hidden />
                      Catat bukti
                    </Button>
                  }
                />
              ) : (
                <div className="grid-cards">
                  {evidence.map((item) => (
                    <Card key={item.id} size="sm">
                      <CardHeader>
                        <CardTitle>{item.title}</CardTitle>
                        <CardDescription>
                          {item.issuer || "Penerbit tidak dicatat"}
                        </CardDescription>
                        <CardAction>
                          <Badge
                            variant={
                              item.sharedWith.length > 0 ? "secondary" : "outline"
                            }
                            className="gap-1.5 font-normal"
                          >
                            <Users aria-hidden />
                            {item.sharedWith.length}
                          </Badge>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <p className="text-body">{item.claim}</p>

                        <div className="flex flex-col">
                          <div className="metric-row">
                            <span className="metric-label">Subjek</span>
                            <span className="metric-value">{item.subject}</span>
                          </div>
                          <div className="metric-row">
                            <span className="metric-label">Masa berlaku</span>
                            <span className="metric-value metric-value-muted">
                              {item.issuedAt || "—"} sampai {item.expiresAt || "—"}
                            </span>
                          </div>
                        </div>

                        {item.sharedWith.length > 0 && (
                          <ul className="flex flex-col gap-1.5">
                            {item.sharedWith.map((agent) => (
                              <li
                                key={agent}
                                className="flex items-center justify-between gap-2 rounded-control border border-border px-2 py-1.5"
                              >
                                <span className="min-w-0 break-all font-mono text-mono-micro">
                                  {agent}
                                </span>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => void onRevoke(item, agent)}
                                  disabled={busy}
                                >
                                  Cabut
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {shareTarget?.id === item.id ? (
                          <div className="flex flex-col gap-2 border-t border-border pt-3">
                            <Label htmlFor={`share-${item.id}`}>WebID penerima</Label>
                            <Input
                              id={`share-${item.id}`}
                              value={shareTarget.webId}
                              spellCheck={false}
                              placeholder="https://pod.mitra.example/profile/card#me"
                              onChange={(event) =>
                                setShareTarget({
                                  id: item.id,
                                  webId: event.target.value,
                                })
                              }
                            />
                            <p className="text-caption text-muted-foreground">
                              Akses baca diberikan ke resource ini saja, bukan ke
                              seluruh Pod.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => void onShare(item)}
                                disabled={busy}
                              >
                                Beri akses
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShareTarget(null)}
                                disabled={busy}
                              >
                                Batal
                              </Button>
                            </div>
                          </div>
                        ) : confirmId === item.id ? (
                          <div className="flex flex-col gap-2 border-t border-border pt-3">
                            <p className="text-caption">
                              Hapus dokumen dan seluruh aturan berbagi?
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void onDelete(item)}
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
                              href={`/evidence/${encodeURIComponent(item.id)}`}
                              className={buttonVariants({ variant: "secondary", size: "sm" })}
                            >
                              Detail
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setShareTarget({ id: item.id, webId: "" })
                              }
                            >
                              <Share2 aria-hidden />
                              Bagikan
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDraft(draftFrom(item));
                                setConfirmId(null);
                                setShareTarget(null);
                              }}
                            >
                              Ubah
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmId(item.id)}
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
