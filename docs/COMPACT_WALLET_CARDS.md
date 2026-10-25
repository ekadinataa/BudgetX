# Kartu Dompet ringkas — tindak lanjut Open Design

Status: **sudah dirilis dan diverifikasi di production** pada 25 Oktober 2026,
15:35 WIB. Source disimpan pada branch `feat/compact-wallet-cards`, berbasis
`1a45409`. Saat deployment, source belum di-commit/push; sinkronisasi GitHub
merupakan langkah terpisah yang diminta pengguna setelah deployment.

## Acuan

Mengikuti screenshot Open Design yang diberikan pengguna dan renderer Dompet
terakhir di `budgetx-video-redesign.html`: ikon/aksi di atas, identitas di bawah,
saldo terpisah, lalu divider dan arus Masuk/Keluar dalam satu baris.

## Perubahan

- Kartu bank, e-wallet, tunai, kredit dan PayLater memakai susunan yang sama.
  Grid `auto-fill` memakai lebar minimum 280px (tetap muat pada viewport lebih
  sempit), gap 16px, dan tinggi baris setara. Jumlah kolom mengikuti ruang yang
  tersedia, bukan dipaksa tiga kolom pada semua desktop.
- Pada density standar: kartu umum 232px di desktop dan 256px pada layout
  touch/mobile. Ini menggantikan kartu kredit sekitar 330px dan celah besar
  antarbaris pada daftar campuran. Density/radius tetap mengikuti token pengguna.
- Saldo tetap penuh, mono/tabular, dengan tanda negatif berwarna semantik merah.
  Pemasukan/pengeluaran memakai `rpShort`; jumlah lengkap serta bulan tersedia
  pada tooltip footer. Transfer/adjustment dan bulan lain tetap dikecualikan
  seperti implementasi sebelumnya; tidak mengubah perhitungan arus kas.
- Tombol **Rincian kredit** membuka dialog read-only untuk saldo tercatat,
  plafon, outstanding, limit tersedia dan hold. Field tidak hilang, hanya tidak
  membuat tinggi kartu berbeda. Legacy tanpa plafon tetap **Belum diatur**.
- Dialog mengikuti update props wallet secara langsung; Escape, focus trap,
  focus return, body scroll lock, dan tombol Selesai memakai Modal existing.
  Aksi Edit/Hapus dan seluruh alur audit saldo tetap tersedia.
- Warna wallet tersimpan hanya dipakai sebagai aksen ikon; tidak menulis ulang
  data warna. Nama panjang dibatasi dua baris dengan judul lengkap, catatan satu
  baris dengan tooltip, dan nominal besar boleh membungkus tanpa overflow.
- Nama panjang pada metadata pengeluaran di overview juga bisa membungkus agar
  tidak membuat halaman melebar.

Tidak ada perubahan pada App state, service CRUD, Firestore rules, environment,
schema, storage, nominal, perhitungan limit/hold, maupun saldo pengguna.

## Verifikasi

- Sembilan test komponen baru: struktur kartu, kedua jenis kredit, detail live,
  dismiss/focus, callback Edit/Hapus, data tidak berubah, dan arus kas bulanan.
- Delapan test Chrome baru: daftar campuran pada 10 lebar × light/dark, dialog
  pada desktop/mobile × light/dark, serta nama 1000 karakter, catatan panjang dan nominal
  safe-integer. Menjaga tinggi seragam, hierarchy, footer inline, responsivitas,
  fokus, kontras, dan isolasi data saat membuka detail.
- Snapshot review: empat grid dan empat dialog pada 1280/390 px × light/dark.
  Enam belas kombinasi view/theme/density/radius diuji dengan data sintetis;
  568 sampel teks, nol kegagalan kontras/overflow atau exception.
- Suite lengkap akhir: **68 file / 921 test lulus**, nol gagal/skip, dengan Chrome
  aktif dan `--maxWorkers=2` (`bounded-final-tests.json`). Pengulangan paralel
  default sempat terkena timeout resource setelah run pertama lulus; tidak ada
  assertion atau kode aplikasi yang diubah untuk melewati pengujian tersebut.
- Lint dan build lokal lulus; peringatan bundle Vite >500 kB tetap ada seperti
  baseline. Kontras ikon diperiksa pada 20 sampel light/dark termasuk warna
  putih/hitam/pastel tersimpan; minimum 4,09:1, nol kegagalan ambang non-text 3:1.
- Fixture pengujian tidak ikut bundle aplikasi; App, services, helpers keuangan,
  schema, rules, dan konfigurasi Firebase tidak berubah dari `1a45409`.

Semua UAT fungsional memakai Firebase nonaktif dan data sintetis, bukan akun
production. Sesudah pengguna menyetujui deployment, build dibuat ulang dengan
`npm run build` dan konfigurasi Firebase production aktif; bukan memakai hasil
build UAT dengan Firebase kosong. Environment tidak diubah.
Evidence sementara: direktori temp sesi `budgetx-compact-wallet-review/`.

## Rilis production — 25 Oktober 2026

- Hanya Firebase Hosting target/site `budgetx`, project `budgetku-app-v1`,
  URL `https://budgetx.web.app`. Firestore rules, akun, data pengguna, dan site
  redirect lama tidak di-deploy atau dimutasi.
- Waktu: `2026-10-25T08:35:33.977Z` (15:35 WIB).
- Release: `1792917333977000`; version: `5fb3cef5ea314b58`, `FINALIZED`.
- Bundle production: `assets/index-Df1gT9mQ.js`, `assets/index-C-jD6X1u.css`.
- Konfigurasi Firebase production diverifikasi sebelum build/deploy tanpa
  mencetak API key. Fixture pengujian tidak masuk bundle production.
- Smoke build dan live: **14 file publik cocok SHA-256**, 12 kombinasi tampilan
  login/daftar/reset × desktop/mobile × light/dark; nol exception, overflow,
  console error, atau request backend. Tidak melakukan sign-in atau submit form.
  UI Dompet setelah login tidak diuji memakai akun production; bundle identik
  dengan build dan perilaku sudah diuji lokal/mocked cloud.
- URL lama `https://budgetku-app-v1.web.app` tetap 301 ke `https://budgetx.web.app`.
- Versi rollback tepat sebelum rilis ini: **`c4d7a02e2004ab7d`**, release
  `1792903385031000`. Gunakan Firebase Console → Hosting → site `budgetx` →
  riwayat rilis → pilih versi tersebut → rollback. Hosting saja, bukan Firestore.
- Snapshot tanpa environment/credential beserta evidence build/live tersimpan di
  temp sesi `budgetx-compact-wallet-production-20261025-02yfrpwc/`.
- Deployment ini tidak melakukan commit/push GitHub atau merge ke `main`.
