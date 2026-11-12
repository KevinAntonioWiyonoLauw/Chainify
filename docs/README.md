# Chainify

Chainify adalah aplikasi bisnis terdesentralisasi untuk rantai pasok pertanian. Data
usaha tidak disimpan di server Chainify. Setiap pelaku usaha memiliki Pod Solid sendiri,
dan semua profil, penawaran, permintaan, bukti, serta negosiasi tinggal di Pod itu —
bukan di database milik platform.

Dokumen ini menjelaskan apa yang sudah dibangun, bagaimana alurnya bekerja, dan apa yang
belum ada. Isinya diturunkan langsung dari kode yang ada, bukan dari rencana.

---

## 1. Prinsip yang mengikat seluruh sistem

Tiga aturan ini menentukan setiap keputusan teknis. Melanggar salah satunya membuat
fitur ditolak, seberapapun rapi kodenya.

1. **Pod adalah satu-satunya sumber kebenaran.** Server Go tidak menyimpan data bisnis.
   Kalau ada data hilang, itu karena Pod-nya hilang, bukan karena server lupa.
2. **Baca dan tulis Pod terjadi di browser**, memakai sesi Solid-OIDC milik pengguna.
   Server tidak pernah memegang token, dan tidak pernah menjadi perantara penulisan.
3. **Verifikasi bersifat struktural.** Chainify hanya bisa menyatakan bahwa sebuah
   dokumen bisa dibaca dan bentuknya benar. Ia tidak bisa menyatakan bahwa klaim di
   dalamnya benar. Karena itu tidak ada kode yang mengembalikan `verdict: "pass"`.

Konsekuensi langsungnya: tidak ada katalog pusat, tidak ada PostgreSQL, tidak ada Redis,
dan tidak ada salinan katalog untuk dipercepat. Discovery membaca index publik para
peserta secara langsung, setiap kali, lalu membuang hasilnya.

---

## 2. Arsitektur

```
┌──────────────────────┐        ┌──────────────────────┐
│  Browser             │        │  Go API              │
│  Next.js (13000)     │──api──▶│  (13001)             │
│                      │        │                      │
│  Sesi Solid-OIDC     │        │  Stateless.          │
│  (DPoP)              │        │  Hanya membaca.      │
│                      │        │  Tidak menyimpan.    │
└──────────┬───────────┘        └──────────┬───────────┘
           │                               │
           │ PUT / GET (DPoP)              │ GET (SSRF guard)
           ▼                               ▼
┌────────────────────────────────────────────────────────┐
│  Pod Solid peserta (Community Solid Server)            │
│  Profil · Listing · Permintaan · Bukti · RFQ · Inbox   │
└────────────────────────────────────────────────────────┘
```

Ada dua jalur yang sengaja dipisah:

- **Jalur tulis** selalu browser → Pod, dengan sesi DPoP pengguna. API tidak ikut.
- **Jalur baca lintas peserta** lewat API, karena membaca index publik banyak Pod dari
  browser akan kena CORS.

API tetap dibutuhkan meski tidak menyimpan apa pun, karena tiga hal: resolusi WebID ke
lokasi Pod, pemrosesan RDF yang lebih kecil risikonya di sisi server, dan SSRF guard
untuk setiap URL yang berasal dari pengguna.

### Port dan layanan

| Layanan | Alamat | Catatan |
|---|---|---|
| Web app | <https://localhost:13000> | TLS wajib: Solid-OIDC DPoP butuh secure context |
| Go API | <http://localhost:13001> | Plain http, diakses lewat proxy same-origin |
| Provider CSS | <https://localhost:13002> | **TLS saja**; port 13003 adalah upstream plaintext internal |

Akun demo: `alice@example.com` dan `bob@example.com`, password `chainify-demo-2026`.

---

## 3. Alur pengguna

### 3.1 Masuk dengan identitas Solid

Pengguna memasukkan issuer-nya sendiri (misalnya `https://solidcommunity.net/`), atau
memakai provider lokal yang sudah tersedia.

1. Browser membuka `/.oidc/auth` di issuer dengan `client_id`, `redirect_uri`,
   PKCE challenge, dan `prompt=consent`.
2. Issuer **men-dereference** `client_id` menjadi Client ID Document. Dokumen itu
   dihasilkan aplikasi di `/id`, diturunkan dari host yang dipakai request.
3. Pengguna menyetujui, issuer mengembalikan kode, browser menukarnya menjadi token
   yang terikat ke kunci DPoP.
4. Sesi disimpan di `localStorage`. Pada kunjungan berikutnya ia dipulihkan diam-diam
   sekali per tab.

Yang perlu dipahami: langkah 2 terjadi **dari server issuer**, bukan dari browser.
Karena itu `client_id` harus berupa URL yang bisa dijangkau issuer. Provider lokal
`localhost` bekerja karena issuer juga di mesin yang sama; provider publik tidak.

### 3.2 Menyiapkan Pod

Saat pertama kali menulis, aplikasi membuat struktur container di Pod pengguna:

```
<storage-root>/
└── chainify/
    ├── profile/        business-profile.jsonld
    ├── listings/       <slug>.jsonld
    ├── requirements/   <slug>.jsonld
    ├── evidence/       <slug>.jsonld
    ├── rfq/            <slug>.jsonld
    ├── inbox/          dokumen dari pihak lain
    └── public/         index.jsonld  ← satu-satunya yang dipublikasikan
```

Pembuatan container aman diulang. Provider yang menolak membuat ulang container
menjawab `409`, dan provider yang mengabaikan `If-None-Match` menjawab `403` — keduanya
diterima sebagai "sudah ada" setelah dicek dengan `GET`.

### 3.3 Profil usaha

Satu dokumen JSON-LD. Subjeknya adalah WebID pengguna sendiri, jadi pembeli bisa
mencocokkan dokumen itu ke identitas, bukan ke alamat halaman.

Profil memegang satu keputusan: `discoverable`. Kalau aktif, nama, sektor, dan lokasi
usaha masuk ke public index.

### 3.4 Listing dan permintaan

Setiap listing adalah satu dokumen `schema:Offer` (atau `schema:Demand`), satu file di
`listings/`. Harga hanya ada di dokumen itu dan **tidak pernah** masuk public index.

Setiap item punya `visibility`:

- `private` — hanya pemilik yang bisa membaca.
- `discoverable` — ringkasannya masuk public index; dokumen lengkapnya tetap di Pod dan
  tetap butuh akses.

### 3.5 Menerbitkan public index

`chainify/public/index.jsonld` ditulis ulang setiap kali ada perubahan listing atau
profil yang discoverable.

Menulis dokumen belum berarti menerbitkannya. Storage root privat secara default, jadi
pembaca anonim mendapat `403` sampai ACL membukanya. Penerbitan memberi dua izin yang
berbeda:

- izin baca pada file index itu sendiri;
- izin default pada container `public/`, supaya index yang ditulis ulang nanti tetap
  terbaca.

Yang dibagikan hanya `read`. Harga, kontak, dan isi dokumen lain tidak pernah masuk.

### 3.6 Discovery federasi

Pengguna memasukkan URL index milik peserta lain. API membaca semuanya sekaligus:

- maksimal **24** peserta per query;
- konkurensi **4**;
- timeout per permintaan dari konfigurasi;
- peserta yang gagal dilaporkan satu per satu, tidak menggagalkan yang lain.

Hasilnya disertai asal-usul tiap baris: index mana yang mengeluarkannya, kapan dibaca,
dan status HTTP-nya. API tidak menyimpan hasilnya.

### 3.7 Bukti

Bukti adalah catatan klaim, bukan kredensial terverifikasi. Aplikasi membaca dokumennya
dan memeriksa strukturnya. Tidak ada pemeriksaan tanda tangan, tidak ada registry
penerbit, dan tidak ada kontak ke pihak yang disebut sebagai penerbit.

Berbagi bukti dilakukan dalam dua langkah, dan keduanya perlu:

1. WebID penerima dicatat di dalam dokumen — niat berbagi ikut bersama datanya.
2. ACL Pod memberi penerima izin `read` pada file itu.

Langkah kedua tidak selalu bisa. Provider yang tidak membuka WAC dijawab `unsupported`,
dan UI menampilkan itu sebagai peringatan, bukan sebagai keberhasilan.

### 3.8 RFQ dan inbox

RFQ adalah `schema:Message`. Alurnya dua arah dan tidak memakai mail server:

1. Pembeli menulis RFQ di Pod-nya sendiri.
2. Aplikasi me-resolve WebID lawan bicara menjadi lokasi storage.
3. Dokumen dikirim dengan `PUT` terautentikasi ke `inbox/` milik lawan bicara.
4. Kalau ditolak `401`/`403`, penolakan itu dicatat sebagai kegagalan di salinan lokal
   pengirim. Bukan diulang diam-diam, bukan dianggap berhasil.

Penerima membuka `/inbox`, melihat dokumen yang masuk, lalu mengambilnya ke `rfq/` milik
sendiri. Dokumen aslinya **tidak pernah dipindahkan**, karena catatan pengiriman pengirim
menunjuk ke URL itu.

Inbox dibuka dengan aturan yang sempit: `append` saja, untuk `foaf:Agent`. Artinya
pengirim bisa menitipkan dokumen, tapi tidak bisa melihat isi inbox, dan tidak bisa
menimpa nama yang bukan miliknya.

---

## 4. Model data

Dokumen memakai dua kosakata:

- `schema:` untuk field umum yang dimengerti alat lain — nama, kategori, harga, lokasi.
- `cfy:` (`https://chainify.local/ns#`) untuk field khas Chainify yang belum punya
  padanan standar. Namespace ini sengaja diberi label prototipe.

| Dokumen | Tipe RDF | Lokasi |
|---|---|---|
| Profil usaha | `schema:Organization` | `chainify/profile/business-profile.jsonld` |
| Penawaran | `schema:Offer` | `chainify/listings/<slug>.jsonld` |
| Permintaan | `schema:Demand` | `chainify/requirements/<slug>.jsonld` |
| Bukti | `schema:CreativeWork` | `chainify/evidence/<slug>.jsonld` |
| RFQ | `schema:Message` | `chainify/rfq/<slug>.jsonld` |
| Public index | `schema:ItemList` | `chainify/public/index.jsonld` |

---

## 5. Endpoint API

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/healthz` | Proses hidup |
| GET | `/readyz` | Siap melayani, termasuk status provider |
| GET | `/api/meta` | Konfigurasi yang sedang berlaku dan batasnya |
| GET/POST | `/api/identity/resolve` | WebID → lokasi storage dan issuer |
| GET | `/api/pod/probe` | Apakah satu Pod menjawab |
| POST | `/api/discovery/query` | Baca dan gabungkan index peserta |
| GET/POST | `/api/listing/verify` | Pemeriksaan struktural satu dokumen |
| GET | `/api/listing/document` | Ringkasan satu dokumen |

Semua route yang menerima URL dari pengguna melewati SSRF guard: skema dibatasi
`http`/`https`, kredensial di URL ditolak, host harus ada di allowlist, dan setiap alamat
IP hasil resolusi diperiksa. Dialer dipin ke IP yang sudah lolos, sehingga host tidak
bisa lolos pemeriksaan dengan IP publik lalu menjawab lookup kedua dengan `127.0.0.1`.

Browser tidak memanggil `:13001` langsung. Ada proxy same-origin di `/api/*` supaya
halaman https tidak memicu mixed content dan tidak perlu preflight CORS.

---

## 6. Halaman

| Rute | Isi |
|---|---|
| `/` | Halaman publik: apa itu Chainify dan apa yang tidak dijanjikannya |
| `/login` | Memilih issuer Solid |
| `/dashboard` | Ringkasan Pod: jumlah listing, bukti, RFQ, status index |
| `/profile` | Profil usaha, satu dokumen di Pod |
| `/listings` | Penawaran dan permintaan milik sendiri |
| `/discover` | Discovery lintas peserta |
| `/evidence` | Bukti dan kontrol berbagi |
| `/rfq` | Daftar percakapan |
| `/inbox` | Dokumen yang dikirim pihak lain ke Pod Anda |
| `/pod` | Status akses Pod dan identitas sesi |

---

## 7. Menjalankan

```bash
make dev            # CSS + API + web, dengan TLS lokal
make test           # tes frontend dan backend
```

Pemeriksaan wajib sebelum commit:

```bash
cd frontend && bunx tsc --noEmit && bunx eslint && bun run test
cd backend  && go build ./... && go vet ./... && go test ./...
```

Butuh sertifikat lokal untuk `localhost` di port 13000 dan 13002. API memuat CA tambahan
dari `CHAINIFY_EXTRA_CA_FILE` karena provider lokal memakai sertifikat yang tidak ada di
system store.

---

## 8. Batas yang jujur

Ini yang perlu diketahui sebelum menilai aplikasi ini.

**Belum ada validasi DPoP di sisi server.** Token tidak pernah dikirim ke API, dan
keputusan akses sepenuhnya milik Pod. `/api/meta` menyatakan ini secara eksplisit.

**Login ke provider publik belum bisa dilakukan dari mesin lokal.** Issuer
men-dereference `client_id` dari servernya sendiri, jadi `https://localhost:13000/id`
gagal di sana. Ini batas infrastruktur, bukan bug kode: aplikasi butuh origin publik.

**Verifikasi tidak bisa sampai `pass`.** Verdict dipatok pada hasil terlemah. Tidak ada
jalur yang mengizinkan klaim "dokumen ini benar".

**Pencabutan berbagi terbatas.** Menghapus ACL menghentikan akses baru. Salinan yang
sudah diunduh pihak lain tetap ada di luar kendali Pod ini, dan UI mengatakannya
terus terang.

**Belum ada rate limit per klien.** Batas `24` peserta membatasi fan-out per query, tapi
endpoint itu sendiri bisa dipanggil berulang.

**Belum ada pagination pada discovery.** Satu query mengembalikan seluruh hasil dalam
satu respons.

**RFC 9421 / tanda tangan HTTP belum dipakai.** Autentikasi antar layanan masih
mengandalkan DPoP dari browser.

---

## 9. Pekerjaan yang tersedia

Daftar fitur, perbaikan, dan tes yang belum dikerjakan — beserta file dan kriteria
selesainya — ada di [`kontribusi/BACKLOG.md`](./kontribusi/BACKLOG.md). Aturan kode dan
commit ada di [`kontribusi/KONVENSI.md`](./kontribusi/KONVENSI.md).

Ringkasnya:

- **Fitur** — halaman permintaan (requirements) belum ada, padahal container-nya sudah
  dibuat di setiap Pod dan halaman depan sudah menjanjikannya. Halaman diagnostik node
  juga belum ada meski datanya sudah tersedia.
- **Fix** — enam cacat terverifikasi: pesan storage yang menyesatkan, field error yang
  dibuang, dua probe dengan bahasa kegagalan berbeda, loader yang berkedip, dan parser
  anggota container yang terlalu longgar.
- **Tes** — `repository.ts` berisi 611 baris dan belum punya satu tes pun.
