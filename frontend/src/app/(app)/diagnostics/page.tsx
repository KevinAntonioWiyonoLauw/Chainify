"use client";

/**
 * TODO(F2): halaman ini sengaja kosong dan menunggu dikerjakan.
 *
 * Tiga fungsi di `src/lib/chainify/api.ts` sudah ada, sudah bertipe, dan belum pernah
 * dipanggil dari UI mana pun: `probePod`, `getMeta`, dan `getHealth`. Halaman ini
 * tempatnya. Yang dikerjakan hanya komponen — tidak ada fungsi repository yang perlu
 * disentuh, jadi tidak ada risiko ke alur Pod.
 *
 * Yang seharusnya ditampilkan, semuanya data yang sudah dikirim node:
 *
 *  - `getMeta`  -> issuer, allowedOrigins, fetchAllowlist, maxParticipants,
 *                  fetchTimeoutMs, maxProfileBytes, dan array `notes`.
 *  - `getHealth`-> status, service, version, commit, uptimeSeconds.
 *  - `probePod` -> statusCode, latencyMs, contentType, reason untuk satu storage URL.
 *
 * Aturan tampilan yang penting: halaman ini melaporkan apa adanya. Kalau sebuah probe
 * gagal, tampilkan `reason` yang dikirim node, jangan diterjemahkan jadi "gagal".
 * Alasannya sama dengan mengapa `/readyz` membedakan `tls_untrusted_certificate` dari
 * `unreachable`: dua masalah berbeda tidak boleh terlihat identik.
 *
 * Halaman ini tidak butuh sesi Solid: semua data datang dari node, bukan dari Pod.
 */

import { Activity } from "lucide-react";
import { EmptyState } from "@/components/chainify/empty-state";

export default function DiagnosticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div>
          <h1>Diagnostik node</h1>
          <p className="page-lead mt-1.5">
            Apa yang node Chainify laporkan tentang dirinya sendiri: konfigurasi yang
            sedang berlaku, batas yang dipasang, dan apakah provider Solid menjawab.
          </p>
        </div>
      </div>

      <EmptyState
        icon={Activity}
        title="Halaman ini belum diimplementasikan"
        description="probePod, getMeta, dan getHealth sudah tersedia di src/lib/chainify/api.ts tapi belum dipakai UI mana pun. Kerjakan item F2 di docs/kontribusi/BACKLOG.md untuk membangunnya."
      />
    </div>
  );
}
