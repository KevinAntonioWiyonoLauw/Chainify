"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Pencil,
  Plus,
  Trash2,
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
  deleteListing,
  describeSkipped,
  listListings,
  publishIndex,
  saveListing,
  type ListingInput,
  type RepositoryContext,
} from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { usePodList } from "@/lib/chainify/use-pod-list";
import {
  LISTING_CATEGORIES,
  LISTING_UNITS,
  type Listing,
  type ListingUnit,
} from "@/lib/chainify/vocab";
import { PodError } from "@/lib/solid/resources";
import { useSolidSession } from "@/lib/solid/use-solid-session";

interface Draft {
  id?: string;
  kind: Listing["kind"];
  title: string;
  category: string;
  description: string;
  quantity: string;
  unit: ListingUnit;
  price: string;
  currency: string;
  minimumOrder: string;
  location: string;
  visibility: Listing["visibility"];
  createdAt?: string;
}

const EMPTY_DRAFT: Draft = {
  kind: "offer",
  title: "",
  category: "",
  description: "",
  quantity: "",
  unit: "kg",
  price: "",
  currency: "IDR",
  minimumOrder: "",
  location: "",
  visibility: "discoverable",
};

function draftFrom(listing: Listing): Draft {
  return {
    id: listing.id,
    kind: listing.kind,
    title: listing.title,
    category: listing.category,
    description: listing.description,
    quantity: listing.quantity,
    unit: listing.unit,
    price: listing.price,
    currency: listing.currency,
    minimumOrder: listing.minimumOrder,
    location: listing.location,
    visibility: listing.visibility,
    createdAt: listing.createdAt,
  };
}

function errorText(cause: unknown): string {
  if (cause instanceof PodError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}

const selectClass =
  "h-control-md w-full rounded-control border border-input bg-(--control) px-2.5 text-body text-foreground shadow-control outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function ListingsPage() {
  const session = useSolidSession();
  const owner = useOwner(session);

  const [busy, setBusy] = useState(false);
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
      ctx
        ? listListings(ctx)
        : Promise.reject(new Error("no repository context")),
    [ctx],
  );
  const { value, error, loading, reload } = usePodList(
    ctx ? load : null,
    ctx?.storage ?? "",
  );

  const listings = value?.listings ?? [];
  const skipped = describeSkipped(value?.skipped ?? []);

  const missingContainer = error instanceof PodError && error.kind === "not_found";

  const onSave = async () => {
    if (!ctx || !draft) return;
    if (draft.title.trim().length === 0) {
      toast.error("Judul listing wajib diisi.");
      return;
    }
    if (draft.category.trim().length === 0) {
      toast.error("Kategori wajib dipilih.", {
        description:
          "Kategori adalah field yang dipakai penyaring mitra saat discovery.",
      });
      return;
    }
    setBusy(true);
    try {
      const input: ListingInput = {
        id: draft.id,
        kind: draft.kind,
        title: draft.title.trim(),
        category: draft.category,
        description: draft.description,
        quantity: draft.quantity,
        unit: draft.unit,
        price: draft.price,
        currency: draft.currency,
        minimumOrder: draft.minimumOrder,
        location: draft.location,
        visibility: draft.visibility,
        createdAt: draft.createdAt,
      };
      const saved = await saveListing(ctx, input);
      reload();
      // The index is what a peer reads. Rewriting it on every discoverable save keeps a
      // listing from existing in the Pod while staying invisible to discovery.
      if (saved.visibility === "discoverable") {
        await publishIndex(ctx).catch(() => undefined);
      }
      setDraft(null);
      toast.success(draft.id ? "Listing diperbarui." : "Listing dibuat.", {
        description: saved.sourceUrl,
      });
    } catch (cause) {
      toast.error("Listing gagal disimpan.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (listing: Listing) => {
    if (!ctx) return;
    setBusy(true);
    try {
      await deleteListing(ctx, listing.id);
      reload();
      await publishIndex(ctx).catch(() => undefined);
      setConfirmId(null);
      toast.success("Listing dihapus dari Pod.", {
        description: "Salinan yang sudah diunduh pihak lain tidak ikut terhapus.",
      });
    } catch (cause) {
      toast.error("Listing gagal dihapus.", { description: errorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Listing</h1>
          <p className="page-lead mt-1.5">
            Penawaran dan permintaan milik Anda, masing-masing satu dokumen di
            Pod. Harga hanya ada di dokumen itu, bukan di public index.
          </p>
        </div>
        {owner.status === "ready" && (
          <Button
            size="sm"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            disabled={draft !== null}
          >
            <Plus aria-hidden />
            Listing baru
          </Button>
        )}
      </div>

      <PodGate owner={owner}>
        {() => {
          if (loading) {
            return (
              <div className="grid-cards" aria-label="Memuat listing">
                <Skeleton className="h-44 w-full rounded-xl" />
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
                  <AlertTitle>Listing tidak dapat dibaca</AlertTitle>
                  <AlertDescription>
                    <p>{errorText(error)}</p>
                  </AlertDescription>
                </Alert>
              )}

              {skipped.length > 0 && (
                <div className="surface-quiet">
                  <p className="eyebrow">Dokumen dilewati</p>
                  <p className="mt-2 text-body text-muted-foreground">
                    {skipped.length} dokumen gagal dibaca dan tidak ditampilkan.
                    Chainify tidak menebak isinya:{" "}
                    <span className="font-mono text-micro">{skipped.join(", ")}</span>
                  </p>
                </div>
              )}

              {draft && (
                <Card>
                  <CardHeader>
                    <CardTitle>{draft.id ? "Ubah listing" : "Listing baru"}</CardTitle>
                    <CardDescription>
                      Setiap simpan langsung menulis ke Pod Anda. Tidak ada draf di
                      server.
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
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="listing-kind">Jenis</Label>
                        <select
                          id="listing-kind"
                          className={selectClass}
                          value={draft.kind}
                          onChange={(event) =>
                            setDraft({ ...draft, kind: event.target.value as Listing["kind"] })
                          }
                        >
                          <option value="offer">Penawaran: saya menjual</option>
                          <option value="demand">Permintaan: saya mencari</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="listing-category">Kategori</Label>
                        <select
                          id="listing-category"
                          className={selectClass}
                          value={draft.category}
                          onChange={(event) =>
                            setDraft({ ...draft, category: event.target.value })
                          }
                        >
                          <option value="">Pilih kategori</option>
                          {LISTING_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="listing-title">Judul</Label>
                      <Input
                        id="listing-title"
                        value={draft.title}
                        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        placeholder="Kopi Arabika Gayo, sortasi basah"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="listing-description">Deskripsi</Label>
                      <Textarea
                        id="listing-description"
                        className="min-h-24"
                        value={draft.description}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                        placeholder="Mutu, proses, dan konsistensi pasokan."
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="listing-quantity">Jumlah</Label>
                        <Input
                          id="listing-quantity"
                          inputMode="decimal"
                          value={draft.quantity}
                          onChange={(event) =>
                            setDraft({ ...draft, quantity: event.target.value })
                          }
                          placeholder="500"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="listing-unit">Satuan</Label>
                        <select
                          id="listing-unit"
                          className={selectClass}
                          value={draft.unit}
                          onChange={(event) =>
                            setDraft({ ...draft, unit: event.target.value as ListingUnit })
                          }
                        >
                          {LISTING_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="listing-minimum">Minimum order</Label>
                        <Input
                          id="listing-minimum"
                          value={draft.minimumOrder}
                          onChange={(event) =>
                            setDraft({ ...draft, minimumOrder: event.target.value })
                          }
                          placeholder="100 kg"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-3">
                      <div className="flex flex-col gap-2 sm:col-span-2">
                        <Label htmlFor="listing-price">Harga indikatif</Label>
                        <Input
                          id="listing-price"
                          value={draft.price}
                          onChange={(event) =>
                            setDraft({ ...draft, price: event.target.value })
                          }
                          placeholder="nego / 85000"
                          aria-describedby="listing-price-help"
                        />
                        <p
                          id="listing-price-help"
                          className="text-caption text-muted-foreground"
                        >
                          Teks bebas, supaya &ldquo;nego&rdquo; tetap jujur. Harga
                          tidak pernah masuk public index.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="listing-currency">Mata uang</Label>
                        <Input
                          id="listing-currency"
                          value={draft.currency}
                          onChange={(event) =>
                            setDraft({ ...draft, currency: event.target.value })
                          }
                          placeholder="IDR"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="listing-location">Lokasi kasar</Label>
                      <Input
                        id="listing-location"
                        value={draft.location}
                        onChange={(event) =>
                          setDraft({ ...draft, location: event.target.value })
                        }
                        placeholder="Kabupaten Aceh Tengah"
                      />
                    </div>

                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-body font-medium">Visibilitas</legend>
                      {(
                        [
                          {
                            value: "discoverable" as const,
                            title: "Bisa ditemukan",
                            hint: "Judul, kategori, lokasi, dan jumlah masuk public index.",
                          },
                          {
                            value: "private" as const,
                            title: "Privat",
                            hint: "Tetap di Pod Anda, tetapi tidak muncul di discovery.",
                          },
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.value}
                          className="flex items-start gap-3 rounded-control border border-border p-3"
                        >
                          <input
                            type="radio"
                            name="listing-visibility"
                            className="mt-0.5 size-4 accent-(--primary)"
                            checked={draft.visibility === option.value}
                            onChange={() =>
                              setDraft({ ...draft, visibility: option.value })
                            }
                          />
                          <span className="flex flex-col gap-1">
                            <span className="text-body font-medium text-foreground">
                              {option.title}
                            </span>
                            <span className="text-caption text-muted-foreground">
                              {option.hint}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>

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

              {listings.length === 0 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title="Belum ada listing"
                  description="Container listing di Pod Anda masih kosong. Penawaran pertama akan lahir di Pod, bukan di server Chainify."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraft({ ...EMPTY_DRAFT })}
                      disabled={draft !== null}
                    >
                      <Plus aria-hidden />
                      Buat listing
                    </Button>
                  }
                />
              ) : (
                <div className="grid-cards">
                  {listings.map((listing) => (
                    <Card key={listing.id} size="sm">
                      <CardHeader>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={listing.kind === "offer" ? "default" : "secondary"}
                            className="font-normal"
                          >
                            {listing.kind === "offer" ? "Penawaran" : "Permintaan"}
                          </Badge>
                          <Badge variant="outline" className="gap-1.5 font-normal">
                            <span
                              aria-hidden
                              className={
                                listing.visibility === "discoverable"
                                  ? "status-dot status-dot-ok"
                                  : "status-dot"
                              }
                            />
                            {listing.visibility === "discoverable"
                              ? "Bisa ditemukan"
                              : "Privat"}
                          </Badge>
                        </div>
                        <CardTitle className="mt-1">{listing.title}</CardTitle>
                        <CardDescription>
                          {listing.category}
                          {listing.location ? ` · ${listing.location}` : ""}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        {listing.description && (
                          <p className="text-body text-muted-foreground">
                            {listing.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                          {listing.quantity && (
                            <span>
                              {listing.quantity} {listing.unit}
                            </span>
                          )}
                          {listing.minimumOrder && (
                            <span>Min. {listing.minimumOrder}</span>
                          )}
                          {listing.price && (
                            <span className="text-foreground">
                              {listing.currency} {listing.price}
                            </span>
                          )}
                        </div>

                        {confirmId === listing.id ? (
                          <div className="flex flex-col gap-2 border-t border-border pt-3">
                            <p className="text-caption text-foreground">
                              Hapus dokumen ini dari Pod? Salinan yang sudah diunduh
                              pihak lain tidak ikut hilang.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void onDelete(listing)}
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
                              href={`/listings/${encodeURIComponent(listing.id)}`}
                              className={buttonVariants({ variant: "secondary", size: "sm" })}
                            >
                              Detail
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDraft(draftFrom(listing));
                                setConfirmId(null);
                              }}
                            >
                              <Pencil aria-hidden />
                              Ubah
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmId(listing.id)}
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
