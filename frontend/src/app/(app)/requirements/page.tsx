"use client";

/**
 * TODO(R2): halaman ini sengaja kosong dan menunggu dikerjakan.
 *
 * Kerangkanya sudah lengkap supaya pola yang dipakai sama dengan /listings:
 * `useSolidSession` -> `useOwner` -> `PodGate` -> `usePodList`. Yang belum ada adalah
 * lapisan datanya: tipe `Requirement`, mapper dokumen, dan tiga fungsi repository.
 * Itu item R1 di `docs/kontribusi/BACKLOG.md`, dikerjakan sebelum halaman ini.
 *
 * Container `chainify/requirements/` sudah dibuat di Pod oleh `preparePod` sejak awal,
 * tapi sampai sekarang tidak pernah dibaca atau ditulis. Halaman inilah yang akhirnya
 * memakainya.
 *
 * Jangan menambah entri sidebar di sini: itu item R3, dikerjakan terpisah.
 */

import { Plus } from "lucide-react";
import { EmptyState } from "@/components/chainify/empty-state";
import { PodGate } from "@/components/chainify/pod-gate";
import { Button } from "@/components/ui/button";
import { useOwner } from "@/lib/chainify/use-owner";
import { useSolidSession } from "@/lib/solid/use-solid-session";

export default function RequirementsPage() {
  const session = useSolidSession();
  const owner = useOwner(session);

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Permintaan</h1>
          <p className="page-lead mt-1.5">
            Kebutuhan yang Anda cari, masing-masing satu dokumen di Pod. Target harga
            hanya ada di dokumen itu, bukan di public index. Penawaran ada di halaman
            Listing.
          </p>
        </div>
        {owner.status === "ready" && (
          <Button size="sm" disabled title="Belum diimplementasikan (item R2)">
            <Plus aria-hidden />
            Permintaan baru
          </Button>
        )}
      </div>

      <PodGate owner={owner}>
        {() => (
          <EmptyState
            icon={Plus}
            title="Halaman ini belum diimplementasikan"
            description="Lapisan data untuk permintaan belum ada. Kerjakan item R1 lalu R2 di docs/kontribusi/BACKLOG.md, dan halaman ini akan menampilkan daftar permintaan dari Pod Anda."
          />
        )}
      </PodGate>
    </div>
  );
}
