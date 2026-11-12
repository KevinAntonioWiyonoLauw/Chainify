# Contoh Commit

Referensi cepat saat menulis commit message. Setiap baris di bawah adalah commit
tersendiri, bukan satu commit besar.

## Fitur

```
feat(requirements): tambah model dan repository untuk dokumen permintaan
feat(requirements): halaman daftar dan form permintaan
feat(requirements): sertakan permintaan discoverable di public index
feat(ui): tambah entri navigasi requirements
```

## Fix

```
fix(pod): tampilkan nilai storage mentah pada status no_storage
fix(pod): tampilkan detail kegagalan provider di kartu status
fix(backend): laporkan penyebab gagal probe Pod, bukan hanya unreachable
fix(ui): jangan tampilkan loader saat sumber data belum tersedia
fix(pod): hanya hitung objek ldp:contains sebagai anggota container
```

## Tes

```
test(pod): tambah fixture fetch yang meniru perilaku CSS
test(repository): kunci perilaku preparePod yang idempoten
test(repository): kunci log pengiriman RFQ saat ditolak
test(repository): kunci urutan tulis pada claimInboxEntry
```

## Commit yang baik, dilihat dari diff-nya

**Satu perubahan, satu commit.** Kalau Anda mengerjakan F1 lalu sekalian merapikan
tata letak kartu, itu dua commit. Review jadi mudah, dan kalau tata letak baru bermasalah
`git revert` tidak perlu ikut membatalkan perbaikan F1.

**Body commit saat keputusannya tidak jelas dari diff.** Tulis alasannya, bukan
apa yang diubah:

```
fix(pod): tampilkan nilai storage mentah pada status no_storage

Profil solidcommunity.net mengembalikan storage "/" karena parser Turtle lama
menggabungkan prefix relatif secara string. Halaman menyalahkan profil, padahal
profilnya benar. Sekarang nilai mentahnya ikut dibawa supaya penyebab sebenarnya
terlihat.
```

**Jangan mencampur format.** Semua commit pakai `tipe(scope): ringkasan`.
Riwayat yang konsisten lebih mudah dinilai daripada riwayat dengan campuran
`update`, `fix`, dan `wip`.

## Urutan yang disarankan untuk satu orang

Kalau Anda baru mulai dan ingin riwayat yang enak dilihat dosen:

```
1. test(pod): tambah fixture fetch yang meniru perilaku CSS
2. test(repository): kunci perilaku preparePod yang idempoten
3. feat(requirements): tambah model dan repository untuk dokumen permintaan
4. feat(requirements): halaman daftar dan form permintaan
5. fix(pod): tampilkan nilai storage mentah pada status no_storage
```

Lima commit itu sudah menunjukkan: Anda bisa menulis tes, membangun lapisan data,
membangun UI, dan memperbaiki bug. Itu cakupan yang cukup untuk dinilai.
