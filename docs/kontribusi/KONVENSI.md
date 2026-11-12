# Konvensi Chainify

Aturan ini berlaku untuk semua kode di repo. Kalau Anda ragu, ikuti file di sekitarnya
dulu — konsistensi dengan kode yang ada lebih penting daripada preferensi pribadi.

## Bahasa

- **Kode dan komentar: bahasa Inggris.** Nama variabel, nama fungsi, dan komentar.
- **Teks yang dilihat pengguna: bahasa Indonesia.** Semua label, tombol, pesan error,
  dan isi toast. Repo ini sudah konsisten begitu; jangan campur.

## Gaya kode

### TypeScript / React

- Nama file komponen: `kebab-case.tsx`. Nama hook: `use-sesuatu.ts`.
- Komponen React: `PascalCase`. Fungsi dan variabel: `camelCase`.
- Tipe dan interface: `PascalCase`, tanpa prefix `I`.
- `"use client"` hanya di file yang benar-benar butuh state atau event browser.
- Jangan pakai `any`. Kalau tipe dari luar tidak diketahui, pakai `unknown` lalu
  persempit dengan type guard.
- Komentar hanya untuk hal yang **tidak jelas dari kodenya**: alasan sebuah keputusan,
  bug yang pernah terjadi, atau batasan provider. Jangan komentari apa yang sudah
  terbaca dari nama fungsi.

### Go

- Nama fungsi dan variabel: `snake_case` tidak dipakai di Go — ikuti idiom Go:
  `camelCase` untuk privat, `PascalCase` untuk ekspor.
- Error sebagai nilai, bukan panic. `panic` hanya untuk salah konfigurasi saat start.
- Setiap handler yang menerima URL dari pengguna **wajib** lewat `identity.Guard`
  sebelum melakukan request apa pun.

## Aturan yang tidak boleh dilanggar

Tiga aturan ini adalah inti produk. Melanggar salah satunya membuat fitur ditolak,
seberapapun rapi kodenya.

1. **Pod adalah satu-satunya sumber kebenaran.** Tidak boleh ada salinan data bisnis di
   server Go. Membaca dari Pod lalu menyimpannya ke memori lintas request dilarang.
2. **Baca/tulis Pod terjadi di browser**, memakai sesi Solid-OIDC pengguna. Server Go
   tidak pernah memegang token.
3. **Verifikasi bersifat struktural.** Tidak ada kode yang boleh mengembalikan
   `verdict: "pass"` untuk klaim bisnis. Pemeriksaan hanya menyatakan bahwa sebuah
   dokumen bisa dibaca dan bentuknya benar — bukan bahwa isinya benar.

## Format commit

Satu commit = satu perubahan yang bisa dijelaskan dalam satu kalimat.

```
feat(scope): apa yang ditambahkan
fix(scope): apa yang diperbaiki
test(scope): tes apa yang ditambahkan
docs(scope): dokumen apa yang diubah
refactor(scope): apa yang dirapikan tanpa mengubah perilaku
```

`scope` adalah area kerja, contoh: `requirements`, `pod`, `discovery`, `inbox`,
`backend`, `ui`.

Contoh yang baik:

```
feat(requirements): tambah model dan repository untuk dokumen permintaan
fix(pod): tampilkan nilai storage mentah pada status no_storage
test(repository): kunci perilaku claimInboxEntry sebelum menyentuh preparePod
```

Contoh yang buruk (jangan):

```
update
fix bug
wip
perbaikan
```

Commit message bahasa Inggris karena itu konvensi umum git dan memudahkan diff dibaca
alat. Deskripsi review boleh bahasa Indonesia.

## Sebelum commit

Wajib lulus semuanya. Jangan commit kalau ada yang merah.

```bash
cd frontend
bunx tsc --noEmit          # 0 error
bunx eslint                # 0 error
bun run test               # semua lulus

cd ../backend
go build ./...
go vet ./...
go test ./...
```

Untuk perubahan yang menyentuh halaman, buka halamannya di browser dan pastikan tidak
ada toast error. Menambah tes tanpa menjalankan halamannya bukan bukti bahwa fiturnya
bekerja.

## Menulis tes frontend

Test memakai Vitest. File tes diletakkan di sebelah file yang diuji:

```
src/lib/chainify/repository.ts
src/lib/chainify/repository.test.ts
```

Yang perlu diuji:

- Kasus normal.
- Kasus gagal: 401, 403, 404, dokumen rusak, jaringan mati.
- Kasus batas: dokumen kosong, daftar kosong, nilai `null`.

Yang tidak perlu diuji: markup JSX, kelas CSS, atau detail library pihak ketiga.

## Menulis tes Go

Test memakai `testing` standar, tanpa framework tambahan.

- Nama tes: `TestXxx` dengan kalimat yang menjelaskan perilaku, bukan nama fungsi.
  Contoh: `TestParseTurtleResolvesRelativeNamespacePrefix`, bukan `TestExpand`.
- Untuk HTTP, pakai `httptest.NewServer` atau `httptest.NewTLSServer`. Jangan memanggil
  jaringan sungguhan dari tes.
- Setiap tes yang menangkap bug harus punya komentar satu baris di atasnya berisi bug
  apa yang pernah terjadi.

## Mengubah halaman yang sudah ada

Kalau memperbaiki halaman, jangan ubah tata letaknya sekaligus. Satu commit untuk
perbaikan perilaku, commit terpisah kalau memang perlu merapikan tampilan. Dua hal
sekaligus dalam satu commit membuat review dan `git bisect` jadi sulit.
