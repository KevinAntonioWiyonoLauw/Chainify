# Backlog Chainify

Semua item di sini sudah diverifikasi terhadap kode yang ada saat dokumen ini ditulis.
Tidak ada yang berupa dugaan. Kalau Anda mengerjakan satu item, tandai dengan `[x]` dan
cantumkan hash commit-nya.

Urutan yang disarankan: **R1 → R2 → R3** (requirements, fitur produk yang belum ada),
lalu **F1 → F2** (fix kecil), lalu **T1 → T4** (tes). Fitur dan fix tidak saling
bergantung; tes bergantung pada fitur yang diuji.

---

## Bagian 1 — Fitur baru

### R1 — Requirements: model dan repository (Pemula, ~200 baris)

**Latar.** `frontend/src/lib/chainify/vocab.ts:254` mendefinisikan
`POD_CONTAINERS` yang membuat container `chainify/requirements/` di setiap Pod. Tapi
tidak ada satu baris kode pun yang membaca atau menulis ke sana. Artinya setiap Pod
punya folder kosong yang tidak pernah dipakai.

Halaman depan (`src/app/page.tsx:52`) menjanjikan: *"Write offers **or requirements** to
your own Pod"*. Yang ada baru `listings` (penawaran). Sisi permintaan belum ada.

**Yang dikerjakan.**

1. Baca `frontend/src/lib/chainify/vocab.ts` dan `models.ts` untuk melihat pola
   dokumen yang sudah ada (`listing`, `evidence`, `rfq`).
2. Tambahkan tipe `Requirement` di `models.ts`, dengan field:
   `id`, `title`, `category`, `description`, `quantity`, `unit`, `targetPrice`,
   `currency`, `location`, `neededBy`, `visibility`, `createdAt`, `updatedAt`,
   `sourceUrl`.
3. Tambahkan `requirementToDocument()` dan `documentToRequirement()` di file yang sama,
   memakai `schema:Demand` sebagai tipe RDF (sudah dipakai listing untuk penawaran).
4. Tambahkan `listRequirements`, `saveRequirement`, `deleteRequirement` di
   `repository.ts`, mengikuti bentuk `listListings`/`saveListing`/`deleteListing`
   persis.
5. Tulis tes di `models.test.ts` untuk round-trip: objek → dokumen → objek harus sama.

**Kriteria selesai.**

- `bunx tsc --noEmit` bersih.
- `bun run test` lulus, termasuk 2 tes baru minimal.
- Belum menyentuh UI sama sekali. Ini murni lapisan data.

**Contoh commit.**

```
feat(requirements): tambah model dan repository untuk dokumen permintaan
test(requirements): kunci round-trip Requirement antar dokumen dan objek
```

---

### R2 — Requirements: halaman daftar dan form (Menengah, ~250 baris)

**Latar.** Kerangka halaman sudah disediakan di
`frontend/src/app/(app)/requirements/page.tsx`. File itu sengaja dikosongkan dan berisi
penanda `TODO(R2)`. Buka dan baca komentarnya.

**Yang dikerjakan.**

1. Ikuti pola `listings/page.tsx`: `useOwner` → `PodGate` → `usePodList` →
   `EmptyState` → daftar kartu.
2. Form tambah/edit memakai komponen yang sudah ada di `src/components/ui/`.
3. Sertakan pilihan `visibility` (`private` / `discoverable`) dengan copy yang sama
   seperti di halaman listing. Jangan bikin istilah baru.
4. Setelah tersimpan, tampilkan toast sukses dan muat ulang daftar.

**Kriteria selesai.**

- Halaman bisa dibuka di `/requirements` dan menampilkan empty state saat Pod kosong.
- Simpan satu requirement → muncul di daftar → hilang setelah dihapus.
- Tidak ada toast error di console browser.
- `bunx tsc --noEmit`, `bunx eslint`, `bun run test` bersih semua.

**Jangan dilakukan di item ini.** Jangan menambah entri sidebar. Itu item R3.

**Contoh commit.**

```
feat(requirements): halaman daftar dan form permintaan
```

---

### R3 — Requirements: masukkan ke public index dan navigasi (Menengah, ~80 baris)

**Latar.** Setelah R1 dan R2, requirement tersimpan tapi belum bisa ditemukan pihak
lain, dan belum bisa dijangkau dari sidebar.

**Yang dikerjakan.**

1. Di `repository.ts`, fungsi `publishIndex` — tambahkan requirement yang
   `visibility === "discoverable"` ke `entries`, dengan `kind: "requirement"`.
   Ikuti bentuk entri listing yang sudah ada di fungsi itu.
2. Di `app-shell.tsx`, tambahkan entri navigasi `/requirements` dengan ikon dari
   `lucide-react`. Letakkan tepat setelah `Listing`.
3. Pastikan `dashboard` menghitung requirement kalau memungkinkan. Kalau tidak, lewati
   bagian ini — jangan paksa.

**Kriteria selesai.**

- Requirement `discoverable` muncul di `chainify/public/index.jsonld` setelah publish.
- Requirement `private` **tidak pernah** muncul di index. Ini wajib dites.
- Sidebar punya entri Requirements dan halamannya terbuka.

**Contoh commit.**

```
feat(requirements): sertakan permintaan discoverable di public index
feat(ui): tambah entri navigasi requirements
```

---

## Bagian 2 — Fix

### F1 — `no_storage` membuang nilai storage aslinya (Pemula, ~40 baris)

**Latar.** `frontend/src/lib/chainify/use-owner.ts:62` memeriksa `isStorageUrl(storage)`.
Kalau gagal, state dibuat `{ status: "no_storage", webId }` — nilai `storage` mentahnya
**dibuang**. Halaman lalu menampilkan "WebID ini tidak menyatakan Solid storage",
padahal profilnya menyatakan sesuatu, hanya formatnya bukan URL absolut.

Kejadian nyata: parser Turtle pernah mengembalikan `storage: ["/"]` untuk profil
`solidcommunity.net`, dan pesan yang muncul menyesatkan karena menyalahkan profil,
bukan parser.

**Yang dikerjakan.**

1. Tambahkan `declared?: string` ke varian `no_storage` di `use-owner.ts`.
2. Isi dengan nilai mentah dari `result.storage[0]` sebelum divalidasi.
3. Di `pod-gate.tsx`, ubah copy: kalau `declared` ada, tampilkan
   "Profil menyatakan `<nilai>`, tapi itu bukan URL absolut" alih-alih
   "belum menyebutkan alamat".

**Kriteria selesai.**

- `bunx tsc --noEmit` bersih.
- Login dengan WebID yang storage-nya rusak menampilkan nilai mentahnya.

```
fix(pod): tampilkan nilai storage mentah pada status no_storage
```

---

### F2 — Halaman Diagnostik Node (Pemula, ~180 baris)

**Latar.** Tiga fungsi di `frontend/src/lib/chainify/api.ts` sudah ada, sudah bertipe,
dan **belum pernah dipanggil dari UI mana pun**: `probePod` (baris 184), `getMeta`
(baris 169), `getHealth` (baris 161). Kerangkanya sudah disediakan di
`frontend/src/app/(app)/diagnostics/page.tsx`, berisi penanda `TODO(F2)`.

Halaman ini tidak menyentuh `repository.ts` dan tidak butuh sesi Solid — semua data
datang dari node Go, bukan dari Pod. Ini item paling aman untuk halaman baru.

**Yang dikerjakan.**

1. Tampilkan isi `getMeta`: issuer, allowedOrigins, fetchAllowlist, maxParticipants,
   fetchTimeoutMs, maxProfileBytes, dan array `notes`.
2. Tampilkan isi `getHealth`: status, service, version, commit, uptimeSeconds.
3. Sediakan satu input untuk URL storage, lalu tombol yang memanggil `probePod` dan
   menampilkan `statusCode`, `latencyMs`, `contentType`, `reason`.
4. Tampilkan `reason` apa adanya. Jangan diterjemahkan jadi "gagal" — node membedakan
   penyebab, dan halaman ini harus mempertahankan perbedaan itu.

**Kriteria selesai.**

- `/diagnostics` menampilkan data nyata dari node di `localhost:13001`.
- Mematikan CSS lalu menekan tombol probe menampilkan `reason` yang dikirim node.
- Tidak ada toast error. Kalau node mati, tampilkan pesan di dalam halaman, bukan toast.

```
feat(ui): halaman diagnostik node memakai probePod, getMeta, dan getHealth
```

---

### F3 — `ProviderReadiness.detail` hilang dari tipe (Pemula, ~30 baris)

**Latar.** `backend/internal/httpapi/server.go` sudah mengirim field `detail` pada
`/readyz` (`tls_untrusted_certificate`, `tls_handshake_rejected: …`, dan lainnya).
Tapi `frontend/src/lib/chainify/types.ts:31` mendefinisikan `ProviderReadiness` tanpa
`detail`, jadi nilainya dibuang dan tidak pernah tampil di UI.

**Yang dikerjakan.**

1. Tambahkan `detail?: string` ke `ProviderReadiness` di `types.ts`.
2. Di `pod-status-card.tsx`, tampilkan `detail` sebagai baris kecil di bawah status
   provider saat `reachable === false`.
3. Jangan menampilkannya saat `reachable === true` — itu hanya noise.

**Kriteria selesai.**

- Matikan CSS (`docker compose stop css`), buka halaman Pod, `detail` muncul.
- Nyalakan lagi, `detail` hilang.

```
fix(pod): tampilkan detail kegagalan provider di kartu status
```

---

### F4 — `pod/probe.go` tidak memakai `probeFailureDetail` (Menengah, ~50 baris)

**Latar.** `backend/internal/httpapi/server.go` sekarang membedakan penyebab kegagalan
provider lewat `probeFailureDetail`. Tapi `backend/internal/pod/probe.go:80` masih
mengembalikan `Reason: "unreachable"` tanpa detail apa pun. Satu perbaikan sudah
dilakukan di satu tempat, belum di tempat lain.

**Yang dikerjakan.**

1. Pindahkan `probeFailureDetail` supaya bisa dipakai kedua paket — cara paling bersih
   adalah memindahkannya ke `internal/pod` lalu dipanggil dari `httpapi`.
2. Tambahkan field `Detail string` pada struct `Probe`.
3. Isi saat `p.client.Do` gagal.
4. Tambahkan tes di `pod/probe_test.go` (buat kalau belum ada).

**Kriteria selesai.**

- `go test ./...` lulus.
- `/api/pod/probe?storage=https://localhost:13002/` mengembalikan `detail` saat gagal.

```
fix(backend): laporkan penyebab gagal probe Pod, bukan hanya unreachable
```

---

### F5 — `usePodList` berkedip loader pada render pertama (Pemula, ~15 baris)

**Latar.** `frontend/src/lib/chainify/use-pod-list.ts:52` menghitung
`loading: settledFor !== runKey`. Saat `load` masih `null` (owner belum siap), nilai ini
`true`, jadi skeleton muncul. Setelah `load` berubah menjadi fungsi, satu frame skeleton
muncul lagi sebelum hasil lama dirender.

**Yang dikerjakan.**

- Kalau `load === null`, kembalikan `loading: false` dan `value: null`.

**Kriteria selesai.**

- Buka `/listings` dengan sesi tersimpan: skeleton muncul sekali, bukan dua kali.

```
fix(ui): jangan tampilkan loader saat sumber data belum tersedia
```

---

### F6 — `extractChildUrls` menerima IRI relatif sembarang (Lanjut, ~60 baris)

**Latar.** `frontend/src/lib/solid/resources.ts:308` memakai regex yang menangkap
**semua** token `<...>` relatif di body container, bukan hanya objek `ldp:contains`.
Pada Community Solid Server aman karena ia memakai IRI absolut, tapi pada provider lain
predikat relatif akan terdaftar sebagai anak container.

**Yang dikerjakan.**

1. Batasi regex ke token yang muncul setelah predikat `ldp:contains`.
2. Tambahkan kasus uji di `container-listing.test.ts`: body berisi predikat relatif
   yang **bukan** anggota harus menghasilkan daftar kosong.

**Kriteria selesai.**

- `bun run test` lulus, termasuk 2 tes baru.

```
fix(pod): hanya hitung objek ldp:contains sebagai anggota container
```

---

## Bagian 3 — Tes

Bagian ini mengunci perilaku yang sudah ada tanpa mengubahnya. Ideal untuk commit
pertama karena risikonya nol.

### T1 — Fixture Pod palsu (Pemula, ~120 baris)

Buat `frontend/src/lib/solid/__fixtures__/pod.ts`: `fetch` tiruan yang meniru perilaku
Community Solid Server.

**Harus meniru.**

- `PUT` dokumen baru → `205`
- `PUT` container yang sudah ada → `409`
- `PUT` ke container `public/` yang ada → `403`
- `GET` dokumen tidak ada → `404`
- `GET` container → Turtle berisi `ldp:contains` relatif
- `GET` tanpa sesi ke resource privat → `401`

Fixtures ini dipakai T2 sampai T4.

```
test(pod): tambah fixture fetch yang meniru perilaku CSS
```

### T2 — `ensureContainer` idempoten (Pemula, ~60 baris)

Tes bahwa `preparePod` bisa dipanggil dua kali tanpa error, dan bahwa `403` diverifikasi
dengan `GET` sebelum dianggap gagal. `repository.ts` sekarang 611 baris dan **nol tes**.

```
test(repository): kunci perilaku preparePod yang idempoten
```

### T3 — `deliverRfq` mencatat kegagalan (Menengah, ~90 baris)

Tes tiga jalur: sukses, `401`/`403` tercatat `ok: false` dengan pesan yang benar, dan
WebID lawan yang tidak menyebut storage.

```
test(repository): kunci log pengiriman RFQ saat ditolak
```

### T4 — `claimInboxEntry` menulis dokumen dulu (Menengah, ~70 baris)

Tes bahwa dokumen ditulis **sebelum** `preparePod`, dan bahwa kegagalan `preparePod`
tidak membatalkan klaim yang sudah mendarat.

```
test(repository): kunci urutan tulis pada claimInboxEntry
```

---

## Yang tidak boleh dikerjakan tanpa koordinasi

### DPoP di sisi server

`GET /api/meta` mengembalikan catatan: *"Server-side DPoP validation is not implemented
in this phase."* Menambahkannya berarti menjawab apa yang harus dibuktikan server,
bagaimana kunci publik dikirim, dan bagaimana kegagalan dilaporkan. Kalau dikerjakan
setengah, catatan di `/api/meta` menjadi bohong dan itu lebih buruk daripada tidak ada.

### Origin publik untuk login

Login ke provider di luar mesin ini gagal karena provider men-dereference
`client_id` dari servernya sendiri. `https://localhost:13000/id` menjadi
`ECONNREFUSED 127.0.0.1:13000` di sisi mereka. Ini butuh tunnel atau domain — keputusan
infrastruktur, bukan perubahan kode.

### `repository.ts` secara lebar

File ini dipakai hampir semua halaman. Menambah fungsi baru untuk item R1 aman. Mengubah
fungsi yang sudah ada tanpa tes T2–T4 dulu berisiko merusak alur yang sudah terbukti E2E.
