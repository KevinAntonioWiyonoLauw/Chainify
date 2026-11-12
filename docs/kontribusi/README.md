# Kontribusi Chainify

Folder ini berisi semua pekerjaan yang **belum dikerjakan** dan bisa diambil oleh
kontributor baru. Tujuannya satu: setiap item cukup kecil untuk diselesaikan dalam
satu atau dua commit yang jelas, dan setiap commit bisa dinilai sendiri.

Kalau Anda baru pertama kali membuka repo ini, baca **Cara mulai** dulu, lalu pilih
satu item dari `BACKLOG.md`.

## Isi folder

| File | Isi |
|---|---|
| [`BACKLOG.md`](./BACKLOG.md) | Daftar lengkap fitur, fix, dan tes yang bisa dikerjakan, lengkap dengan file dan kriteria selesai. |
| [`KONVENSI.md`](./KONVENSI.md) | Aturan kode, commit, dan tes yang berlaku di repo ini. Wajib dibaca sebelum commit pertama. |
| [`CONTOH-COMMIT.md`](./CONTOH-COMMIT.md) | Contoh commit message per item, supaya riwayat git terbaca rapi. |

## Cara mulai

```bash
# 1. Nyalakan seluruh stack (CSS + API + web)
make dev

# 2. Di terminal lain, cek tiga hal ini sebelum commit apa pun
cd frontend && bunx tsc --noEmit
cd frontend && bunx eslint
cd frontend && bun run test

# Backend, kalau menyentuh Go
cd backend && go build ./... && go vet ./... && go test ./...
```

Web ada di <https://localhost:13000>, API di <http://localhost:13001>, provider CSS di
<https://localhost:13002>. Akun demo: `alice@example.com` dan `bob@example.com`,
password `chainify-demo-2026`.

## Tingkat kesulitan

Setiap item di `BACKLOG.md` diberi label:

- **Pemula** — tidak perlu paham Solid. Cocok untuk commit pertama.
- **Menengah** — perlu paham alur Pod atau React state.
- **Lanjut** — perlu paham protokol Solid, ACL, atau Go.

## Yang tidak boleh dikerjakan tanpa koordinasi

Tiga area ini menyentuh keputusan arsitektur atau file yang sedang dipegang orang lain.
Jangan mulai tanpa bertanya dulu:

1. **`frontend/src/lib/chainify/repository.ts`** — dipakai hampir semua halaman.
   Perubahan di sini bisa merusak alur yang sudah terbukti E2E.
2. **Validasi DPoP di sisi server** — `GET /api/meta` secara eksplisit menyatakan
   fase ini belum melakukannya. Kalau dikerjakan setengah, catatan di `/api/meta`
   menjadi bohong.
3. **Origin publik untuk login** — ini keputusan infrastruktur (tunnel atau domain),
   bukan perubahan kode.

Penjelasan lengkap ada di akhir `BACKLOG.md`.
