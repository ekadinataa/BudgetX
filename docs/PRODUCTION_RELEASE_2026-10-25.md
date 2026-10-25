# Rilis production BudgetX — 25 Oktober 2026

Status: **berhasil dirilis dan diverifikasi di production** pada
`2026-10-25T04:43:05.031Z` (11:43 WIB).
Pengguna meminta melanjutkan deployment setelah integrasi Wishlist dan redesign.

## Cakupan

- Project Firebase: `budgetku-app-v1`.
- Target/site Hosting: `budgetx`, URL `https://budgetx.web.app`.
- Frontend statis saja. Firestore rules, akun, data pengguna, dan site redirect
  `budgetku-app-v1` tidak di-deploy atau dimutasi.
- Sumber: branch `feat/video-design-production`, upstream `5084bdc` ditambah
  perubahan lokal yang **saat deployment** belum di-commit/push. Sinkronisasi
  GitHub dilakukan terpisah atas permintaan pengguna, pada branch yang sama;
  tidak mengubah `main` atau melakukan deployment ulang.

## Build dan pemeriksaan

- `npm run build` memakai konfigurasi production, bukan override Firebase kosong.
  API key terisi dan project/authDomain diverifikasi untuk `budgetku-app-v1`
  tanpa mencetak API key atau mengubah file environment.
- Bundle: `assets/index-Dhxvwgev.js`, `assets/index-CnngzmTM.css`.
- `npm run lint` lulus; peringatan bundle Vite >500 kB masih ada seperti baseline.
- Smoke build production: 15 file cocok SHA-256; 12 kombinasi login/daftar/reset
  × desktop/mobile × light/dark render tanpa exception/overflow. Browser memakai
  konteks tanpa akun; tidak mengirim form atau request backend.
- Ulang suite pra-deploy pertama: 902/904 lulus. Dua pemeriksaan asinkron gagal
  karena readiness/timeout. Fixture Wishlist sekarang disiapkan sebelum mount
  React, bukan menimpa localStorage ketika efek persistensi masih aktif; penantian
  hasil validasi FileReader diberi batas 5 detik. Assertion dan kode aplikasi
  tidak dilonggarkan/diubah.
- Gate akhir: **66 file / 904 test lulus; nol gagal dan nol skip**, termasuk Chrome.
  Evidence: `predeploy-final-tests.json`.

## Hasil deployment dan verifikasi live

Perintah yang dijalankan:

```sh
firebase deploy --only hosting:budgetx --project budgetku-app-v1 --non-interactive --message "BudgetX video redesign + Wishlist; upstream 5084bdc + local UI; QA 904 passed; previous version 4c789d29099ae485"
```

- Release baru: `1792903385031000`.
- Version baru: `c4d7a02e2004ab7d`, status `FINALIZED`.
- HTML live menunjuk bundle production yang benar; **14 file publik cocok
  SHA-256 dengan build lokal**, termasuk JS, CSS, font, logo, dan demo.
  `.DS_Store` hanya metadata lokal dan diabaikan oleh Hosting sesuai konfigurasi.
- Smoke live: 12 kombinasi login/daftar/reset × desktop/mobile × light/dark;
  nol exception, overflow, console error, atau request backend. Tidak ada form
  yang dikirim dan tidak ada akun/data production yang dibuat/diubah.
- URL lama `https://budgetku-app-v1.web.app` tetap 301 ke `https://budgetx.web.app`.
- `firebase.json`, `.firebaserc`, konfigurasi Auth dan Firestore rules tidak
  diubah. Environment tidak dimodifikasi. Proses deployment tidak menjalankan
  commit/push GitHub; sinkronisasi source merupakan langkah terpisah.
- Evidence: `production-live-smoke.json` dan empat screenshot auth live pada
  direktori temp sesi `budgetx-react-review/`.

## Jejak rollback

Rilis live sebelum deployment:

- Release: `1791902211962000`.
- Version: `4c789d29099ae485`.
- Waktu: `2026-10-13T14:36:51.962Z`.
- Bundle sebelumnya: `index-Cs-Xig_S.js`, `index-2vyeTbXA.css`.

Rollback bila diperlukan melalui Firebase Console → Hosting → site `budgetx` →
riwayat rilis → pilih rilis sebelumnya → rollback. Ini memulihkan Hosting saja,
bukan data Firestore. Jangan rollback ke preview `pre-wishlist` yang lebih tua
jika tujuannya mengembalikan tepat versi sebelum redesign ini.

Snapshot lokal tanpa environment/credential: direktori temp sesi
`budgetx-production-20261025-u0l_g376/`, berisi `release-snapshot.zip`, patch,
file sumber yang berubah, bundle production, dan manifest SHA-256.
`predeploy-evidence.zip` menyertakan patch akhir setelah stabilisasi test dan
hasil gate. Snapshot bundle diverifikasi identik tepat sebelum deploy.
Evidence pengujian berada di temp sesi `budgetx-react-review/`.

## Batas verifikasi

Tidak melakukan sign-in, pendaftaran, pengiriman email reset, atau CRUD ke
database production. Fungsi keuangan, Wishlist, migrasi, backup dan sinkronisasi
diuji lokal/mocked cloud. Ini bukan klaim UAT akun nyata atau semua perangkat.
