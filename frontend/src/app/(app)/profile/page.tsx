"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Save, Send } from "lucide-react";
import { EmptyState } from "@/components/chainify/empty-state";
import { PodGate } from "@/components/chainify/pod-gate";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
  loadProfile,
  publishIndex,
  saveProfile,
} from "@/lib/chainify/repository";
import { useOwner } from "@/lib/chainify/use-owner";
import { BUSINESS_SECTORS, podPaths, type BusinessProfile } from "@/lib/chainify/vocab";
import { PodError } from "@/lib/solid/resources";
import { useSolidSession } from "@/lib/solid/use-solid-session";

const EMPTY_PROFILE: BusinessProfile = {
  name: "",
  sector: "",
  description: "",
  location: "",
  email: "",
  phone: "",
  website: "",
  discoverable: false,
  updatedAt: "",
};

function errorText(cause: unknown): string {
  if (cause instanceof PodError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}

export default function ProfilePage() {
  const session = useSolidSession();
  const owner = useOwner(session);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);

  useEffect(() => {
    if (owner.status !== "ready") return;
    let cancelled = false;
    loadProfile({ storage: owner.storage, webId: owner.webId })
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded ?? { ...EMPTY_PROFILE });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // A container that does not exist yet is the normal first run, not a failure.
        if (cause instanceof PodError && cause.kind === "not_found") {
          setProfile({ ...EMPTY_PROFILE });
          return;
        }
        toast.error("Gagal membaca profil dari Pod.", {
          description: errorText(cause),
        });
        setProfile({ ...EMPTY_PROFILE });
      });
    // No `finally`: `loading` is derived below. Setting it here would leave the page on
    // a skeleton forever whenever the owner is not `ready`, because the effect never runs.
    return () => {
      cancelled = true;
    };
  }, [owner]);

  const update = <K extends keyof BusinessProfile>(
    key: K,
    value: BusinessProfile[K],
  ) => setProfile((current) => (current ? { ...current, [key]: value } : current));

  const onSave = async () => {
    if (!profile || owner.status !== "ready") return;
    if (profile.name.trim().length === 0) {
      toast.error("Nama usaha wajib diisi.", {
        description: "Tidak ada dokumen yang bisa ditulis tanpa nama.",
      });
      return;
    }
    setBusy("save");
    const ctx = { storage: owner.storage, webId: owner.webId };
    try {
      await saveProfile(ctx, profile);
      const reloaded = await loadProfile(ctx);
      if (reloaded) setProfile(reloaded);
      toast.success("Profil tersimpan di Pod Anda.", {
        description: podPaths(owner.storage).profile,
      });
    } catch (cause) {
      toast.error("Profil gagal disimpan.", { description: errorText(cause) });
    } finally {
      setBusy(null);
    }
  };

  const onPublish = async () => {
    if (!profile || owner.status !== "ready") return;
    setBusy("publish");
    try {
      const result = await publishIndex({
        storage: owner.storage,
        webId: owner.webId,
      });
      // Written is not the same as reachable. The storage root is private by default,
      // so the toast has to say which of the two actually happened.
      if (result.publicRead === "created" || result.publicRead === "already-present") {
        toast.success("Public index diperbarui dan bisa dibaca publik.", {
          description: `${result.entries} entri ditulis ke ${result.url}`,
        });
      } else {
        toast.warning("Public index ditulis, tapi masih privat.", {
          description:
            result.publicRead === "no-control"
              ? "Anda tidak punya izin mengubah ACL di container ini. Buka kontrol berbagi di penyedia Pod Anda dan setel baca publik untuk chainify/public/."
              : "Penyedia Pod ini tidak mengekspos WAC. Setel baca publik untuk chainify/public/ lewat panel berbagi penyedia.",
        });
      }
    } catch (cause) {
      toast.error("Public index gagal ditulis.", {
        description: errorText(cause),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Profil usaha</h1>
          <p className="page-lead mt-1.5">
            Satu dokumen JSON-LD di Pod Anda. Subjeknya WebID Anda sendiri, jadi
            pembeli bisa mencocokkan profil ini ke identitas, bukan ke alamat
            halaman.
          </p>
        </div>
        {owner.status === "ready" && profile && (
          <Badge variant="outline" className="gap-1.5 font-normal">
            <span
              aria-hidden
              className={profile.discoverable ? "status-dot status-dot-ok" : "status-dot"}
            />
            {profile.discoverable ? "Bisa ditemukan" : "Privat"}
          </Badge>
        )}
      </div>

      <PodGate owner={owner}>
        {({ webId, storage: root }) => {
          if (!profile) {
            return (
              <div className="grid-dashboard">
                <Skeleton className="h-80 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
              </div>
            );
          }

          const paths = podPaths(root);

          return (
            <>
              <Alert>
                <Building2 aria-hidden />
                <AlertTitle>Yang ditulis, dan yang tidak</AlertTitle>
                <AlertDescription>
                  Profil hanya berisi nama, sektor, deskripsi, dan lokasi kasar.
                  Email dan telepon tidak pernah masuk public index, meskipun
                  profil Anda ditandai bisa ditemukan. Lokasi yang diminta adalah
                  skala kecamatan atau kabupaten, bukan alamat jalan.
                </AlertDescription>
              </Alert>

              <div className="grid-dashboard">
                <Card>
                  <CardHeader>
                    <CardTitle>Identitas usaha</CardTitle>
                    <CardDescription>
                      Tersimpan di <span className="font-mono text-micro">{paths.profile}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-name">Nama usaha</Label>
                      <Input
                        id="profile-name"
                        value={profile.name}
                        onChange={(event) => update("name", event.target.value)}
                        placeholder="Koperasi Tani Lembang"
                        autoComplete="organization"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-sector">Sektor</Label>
                      <select
                        id="profile-sector"
                        value={profile.sector}
                        onChange={(event) => update("sector", event.target.value)}
                        className="h-control-md w-full rounded-control border border-input bg-(--control) px-2.5 text-body text-foreground shadow-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Pilih sektor</option>
                        {BUSINESS_SECTORS.map((sector) => (
                          <option key={sector} value={sector}>
                            {sector}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-location">Lokasi kasar</Label>
                      <Input
                        id="profile-location"
                        value={profile.location}
                        onChange={(event) => update("location", event.target.value)}
                        placeholder="Kabupaten Bandung Barat"
                        aria-describedby="profile-location-help"
                      />
                      <p
                        id="profile-location-help"
                        className="text-caption text-muted-foreground"
                      >
                        Kecamatan atau kabupaten. Bukan alamat lengkap.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profile-description">Deskripsi</Label>
                      <Textarea
                        id="profile-description"
                        className="min-h-28"
                        value={profile.description}
                        onChange={(event) => update("description", event.target.value)}
                        placeholder="Apa yang diproduksi, sejak kapan, dan kapasitasnya."
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Kontak</CardTitle>
                      <CardDescription>
                        Disimpan di Pod Anda. Tidak dikirim ke node Chainify dan
                        tidak masuk public index.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="profile-email">Email</Label>
                        <Input
                          id="profile-email"
                          type="email"
                          value={profile.email}
                          onChange={(event) => update("email", event.target.value)}
                          autoComplete="email"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="profile-phone">Telepon</Label>
                        <Input
                          id="profile-phone"
                          type="tel"
                          value={profile.phone}
                          onChange={(event) => update("phone", event.target.value)}
                          autoComplete="tel"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="profile-website">Situs</Label>
                        <Input
                          id="profile-website"
                          type="url"
                          inputMode="url"
                          spellCheck={false}
                          value={profile.website}
                          onChange={(event) => update("website", event.target.value)}
                          placeholder="https://"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Visibilitas</CardTitle>
                      <CardDescription>
                        Opt-in eksplisit. Tanpa centang ini, profil Anda tidak
                        muncul di public index dan tidak akan ditemukan mitra.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <label
                        htmlFor="profile-discoverable"
                        className="flex items-start gap-3 rounded-control border border-border p-3"
                      >
                        <input
                          id="profile-discoverable"
                          type="checkbox"
                          className="mt-0.5 size-4 accent-(--primary)"
                          checked={profile.discoverable}
                          onChange={(event) =>
                            update("discoverable", event.target.checked)
                          }
                        />
                        <span className="flex flex-col gap-1">
                          <span className="text-body font-medium text-foreground">
                            Tampilkan profil ini di public index
                          </span>
                          <span className="text-caption text-muted-foreground">
                            Hanya nama, sektor, dan lokasi kasar yang ikut.
                          </span>
                        </span>
                      </label>

                      <div className="action-rail">
                        <Button onClick={() => void onSave()} disabled={busy !== null}>
                          <Save aria-hidden />
                          {busy === "save" ? "Menyimpan…" : "Simpan profil"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void onPublish()}
                          disabled={busy !== null}
                        >
                          <Send aria-hidden />
                          {busy === "publish" ? "Menulis…" : "Perbarui public index"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {profile.updatedAt === "" && (
                    <EmptyState
                      icon={Building2}
                      title="Belum pernah disimpan"
                      description="Dokumen profil belum ada di Pod. Isi nama usaha lalu simpan untuk membuatnya."
                    />
                  )}

                  <div className="surface-quiet">
                    <p className="eyebrow">Subjek dokumen</p>
                    <p className="metric-value mt-2">{webId}</p>
                    <p className="mt-3 text-caption text-muted-foreground">
                      Pembeli mencocokkan pengenal ini dengan pemilik yang
                      dinyatakan di setiap listing dan bukti.
                    </p>
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </PodGate>
    </div>
  );
}
