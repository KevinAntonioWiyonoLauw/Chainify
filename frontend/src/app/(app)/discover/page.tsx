"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Compass,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldQuestion,
} from "lucide-react";
import { EmptyState } from "@/components/chainify/empty-state";
import { VerdictBadge } from "@/components/chainify/verdict-badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  ChainifyApiError,
  queryDiscovery,
  verifyDocument,
} from "@/lib/chainify/api";
import type {
  DiscoveryEntry,
  DiscoveryResponse,
  VerificationResponse,
} from "@/lib/chainify/types";
import { useOwner } from "@/lib/chainify/use-owner";
import { podPaths } from "@/lib/chainify/vocab";
import { useSolidSession } from "@/lib/solid/use-solid-session";

const PARTICIPANTS_KEY = "chainify.discovery.participants";

function splitLines(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The participant list is a browser preference, not Pod data: it is who this person
 * chose to ask, and losing it on reload would be an annoyance, not a data loss. It is
 * read once as the initial value rather than written from an effect, so the field is
 * never populated by a state update during render.
 */
function initialParticipants(storage: string | null): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(PARTICIPANTS_KEY);
  if (stored && stored.trim().length > 0) return stored;
  return storage ? podPaths(storage).publicIndex : "";
}

export default function DiscoverPage() {
  const session = useSolidSession();
  const owner = useOwner(session);

  const [participantsText, setParticipantsText] = useState(() =>
    initialParticipants(owner.status === "ready" ? owner.storage : null),
  );
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResponse | null>(
    null,
  );

  const run = useCallback(async () => {
    const participants = splitLines(participantsText);
    if (participants.length === 0) {
      toast.error("Isi minimal satu URL index peserta.");
      return;
    }
    window.localStorage.setItem(PARTICIPANTS_KEY, participantsText);
    setRunning(true);
    setError(null);
    setVerification(null);
    try {
      const response = await queryDiscovery(participants, query.trim());
      setResult(response);
    } catch (cause) {
      setResult(null);
      setError(
        cause instanceof ChainifyApiError
          ? `${cause.message} (${cause.code})`
          : "Discovery gagal dijalankan.",
      );
    } finally {
      setRunning(false);
    }
  }, [participantsText, query]);

  const verify = async (entry: DiscoveryEntry) => {
    if (!entry.url) return;
    setReading(entry.url);
    setVerification(null);
    try {
      const response = await verifyDocument(entry.url);
      setVerification(response);
    } catch (cause) {
      toast.error("Pemeriksaan dokumen gagal.", {
        description:
          cause instanceof ChainifyApiError
            ? `${cause.message} (${cause.code})`
            : "Dokumen tidak dapat dibaca.",
      });
    } finally {
      setReading(null);
    }
  };

  const peerName = (url: string) =>
    result?.peers.find((peer) => peer.url === url)?.displayName ?? url;

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Discovery</h1>
          <p className="page-lead mt-1.5">
            Node membaca public index dari Pod peserta yang Anda sebut, lalu
            menggabungkannya sekali ini saja. Tidak ada katalog di tengah dan
            tidak ada hasil yang disimpan.
          </p>
        </div>
        {result && (
          <Badge variant="outline" className="font-normal">
            {result.entries.length} entri · {result.peers.length} peserta
          </Badge>
        )}
      </div>

      <div className="grid-dashboard">
        <Card>
          <CardHeader>
            <CardTitle>Peserta</CardTitle>
            <CardDescription>
              Satu URL public index per baris. Index Anda sendiri sudah diisi
              dari Pod.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="participants">URL index peserta</Label>
              <textarea
                id="participants"
                className="obsidian-scroll min-h-28 w-full resize-y rounded-control border border-input bg-(--control) p-2.5 font-mono text-mono-caption text-foreground shadow-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
                spellCheck={false}
                value={participantsText}
                onChange={(event) => setParticipantsText(event.target.value)}
                placeholder="https://pod.mitra.example/chainify/public/index.jsonld"
                aria-describedby="participants-help"
              />
              <p
                id="participants-help"
                className="text-caption text-muted-foreground"
              >
                Alamat non-publik ditolak sebelum permintaan keluar. Peserta yang
                gagal tidak menggagalkan yang lain.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="query">Kata kunci</Label>
              <Input
                id="query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="kopi"
              />
            </div>

            <div className="action-rail">
              <Button onClick={() => void run()} disabled={running}>
                {running ? (
                  <RefreshCw aria-hidden className="animate-spin" />
                ) : (
                  <Search aria-hidden />
                )}
                {running ? "Membaca…" : "Jalankan discovery"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {verification ? (
          <Card>
            <CardHeader>
              <CardTitle>Pemeriksaan dokumen</CardTitle>
              <CardDescription className="break-all">
                {verification.url}
              </CardDescription>
              <CardAction>
                <VerdictBadge verdict={verification.verdict} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col">
                {verification.checks.map((check) => (
                  <li key={check.id} className="metric-row">
                    <span className="metric-label">{check.label}</span>
                    <span className="flex flex-col gap-1">
                      <Badge
                        variant={
                          check.result === "fail"
                            ? "destructive"
                            : check.result === "pass"
                              ? "secondary"
                              : "outline"
                        }
                        className="w-fit font-normal"
                      >
                        {check.result}
                      </Badge>
                      <span className="text-caption text-muted-foreground">
                        {check.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="rounded-control border border-border bg-muted p-3">
                <p className="eyebrow flex items-center gap-1.5">
                  <ShieldQuestion aria-hidden className="size-3" />
                  Batas pemeriksaan
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-caption text-muted-foreground">
                  {verification.limits.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-transparent">
            <CardHeader>
              <CardTitle>Cara membaca hasil</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-body text-muted-foreground">
              <p>
                Setiap baris menyebut peserta asalnya. Kalau dua peserta menulis
                judul yang sama, keduanya tampil: Chainify tidak menggabungkan
                dua klaim menjadi satu.
              </p>
              <p>
                Pemeriksaan hanya membaca bentuk dokumen. Lolos pemeriksaan
                berarti dokumennya rapi, bukan bahwa usaha itu benar-benar ada.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {error && (
        <Alert>
          <Compass aria-hidden />
          <AlertTitle>Discovery tidak berjalan</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
          </AlertDescription>
        </Alert>
      )}

      {running && (
        <div className="grid-cards" aria-label="Memuat hasil">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}

      {!running && result && (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2>Status peserta</h2>
              <span className="text-caption text-muted-foreground">
                Dibaca {new Date(result.fetchedAt).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="grid-cards">
              {result.peers.map((peer) => (
                <div key={peer.url} className="surface-quiet">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">
                        {peer.displayName || "Tanpa nama"}
                      </p>
                      <p className="mt-1 break-all font-mono text-mono-micro text-muted-foreground">
                        {peer.url}
                      </p>
                    </div>
                    <Badge
                      variant={peer.reachable ? "secondary" : "destructive"}
                      className="gap-1.5 font-normal"
                    >
                      <span
                        aria-hidden
                        className={
                          peer.reachable ? "status-dot status-dot-ok" : "status-dot"
                        }
                      />
                      {peer.reachable ? "Terbaca" : "Gagal"}
                    </Badge>
                  </div>
                  {peer.reachable ? (
                    <p className="mt-3 text-caption text-muted-foreground">
                      {peer.entries} entri
                      {peer.publishedAt
                        ? ` · index dibuat ${new Date(peer.publishedAt).toLocaleDateString("id-ID")}`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-3 text-caption text-muted-foreground">
                      {peer.error || "Index tidak dapat dibaca."}
                      {peer.errorCode ? ` (${peer.errorCode})` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2>Hasil gabungan</h2>
            {result.entries.length === 0 ? (
              <EmptyState
                icon={Compass}
                title="Tidak ada entri"
                description="Peserta terbaca, tetapi tidak ada baris yang cocok. Index yang kosong biasanya berarti pemiliknya belum menandai apa pun sebagai bisa ditemukan."
              />
            ) : (
              <div className="grid-cards">
                {result.entries.map((entry) => (
                  <Card key={`${entry.participant}|${entry.url}|${entry.title}`} size="sm">
                    <CardHeader>
                      <CardTitle>{entry.title}</CardTitle>
                      <CardDescription>
                        {entry.category || "Tanpa kategori"}
                        {entry.location ? ` · ${entry.location}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        {entry.kind && (
                          <Badge variant="outline" className="font-normal">
                            {entry.kind === "offer"
                              ? "Penawaran"
                              : entry.kind === "demand"
                                ? "Permintaan"
                                : entry.kind}
                          </Badge>
                        )}
                        {entry.quantity && (
                          <Badge variant="secondary" className="font-normal">
                            {entry.quantity} {entry.unit ?? ""}
                          </Badge>
                        )}
                      </div>

                      <p className="text-caption text-muted-foreground">
                        Dari{" "}
                        <span className="text-foreground">
                          {peerName(entry.participant)}
                        </span>
                      </p>

                      <div className="action-rail">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void verify(entry)}
                          disabled={reading !== null || !entry.url}
                        >
                          <ShieldQuestion aria-hidden />
                          {reading === entry.url ? "Memeriksa…" : "Periksa"}
                        </Button>
                        {entry.url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            nativeButton={false}
                            render={
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noreferrer noopener"
                              />
                            }
                          >
                            Buka dokumen
                            <ExternalLink aria-hidden />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <div className="surface-quiet">
            <p className="eyebrow">Catatan dari node</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-caption text-muted-foreground">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {!running && !result && !error && (
        <EmptyState
          icon={Compass}
          title="Belum ada hasil"
          description="Discovery berjalan saat Anda menekan tombolnya. Hasil tidak disimpan, jadi membuka halaman ini lagi berarti bertanya sekali lagi."
        />
      )}
    </div>
  );
}
