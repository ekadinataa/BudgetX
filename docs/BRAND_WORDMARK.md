# BudgetX — wordmark dari referensi pengguna

## Sumber dan cakupan

- Referensi terang: `img_f172801711fb.png` (135 × 40).
- Referensi gelap: `img_13eca5067b0e.png` (137 × 37).
- Aset huruf kecil **budgetx** dipertahankan dari piksel gambar asli: navy/putih untuk `budget`, x hijau-teal dari referensi. Tidak menebak font atau menggambar ulang bentuk huruf.
- Hanya background solid yang dibuat transparan, lalu whitespace luar dipangkas. Canvas kedua varian 124 × 30; varian terang diberi 1px padding transparan kanan untuk menyamakan ukuran.
- `src/components/BrandLogo.jsx` dipakai bersama di Topbar, Masuk, Daftar, dan Reset Password. Satu label aksesibel `BudgetX`; gambar turunannya dekoratif agar pembaca layar tidak membaca dua logo.
- Pergantian varian mengikuti `html[data-theme]` yang sudah ada. Ukuran native dipakai agar PNG kecil tidak diperbesar dan tampak pecah. Tidak menambah font/network pihak ketiga.
- Ikon lama di samping nama pada header/auth dihapus, diganti satu wordmark. Subtitle header dan perilaku tombol beranda tetap.
- **Belum mengganti favicon/app icon `public/logo.png`:** SVG `budgetx-mark-growth-x.svg`, `budgetx-appicon-growth-x.svg`, dan `budgetx-appicon-growth-x-soft.svg` tidak tersedia dalam lampiran lokal (chat melaporkan gagal dibaca). Perlu unggahan ulang SVG asli, misalnya di dalam ZIP, untuk menerapkan ikon tersebut tanpa mengarang bentuknya. Dua PNG wordmark tidak membuktikan bentuk ikon standalone.

## Build standalone

Wordmark diimpor dari `src/assets/brand/`; Vite memasukkan PNG kecil ke bundle sebagai data URI. `build-single-html.mjs` menerima nol pemakaian runtime `/logo.png` sambil tetap mendukung pemakaian legacy dan meng-inline favicon. Pemeriksaan referensi lokal, pengamanan function-replacer, dan round-trip JS/CSS tidak dilonggarkan.

## Verifikasi lokal

Firebase dinonaktifkan lewat environment override, tanpa mengganti nama file `.env`. Server QA: `127.0.0.1:5177`. Browser memakai Chrome dan blokir endpoint Firebase.

- Regresi RED → GREEN: Topbar, tiga halaman auth, dan standalone build tanpa referensi runtime logo lama.
- Pemeriksaan branding/browser terarah: **36 test / 6 file lulus**; termasuk navigasi seluruh 14 halaman pada 12 lebar dan kedua tema.
- Test branding khusus: 6 lebar (360, 390, 900, 1024, 1440, 2000), satu varian logo visible yang sudah termuat, rasio asli, tanpa overflow, toggle tema nyata, dan navigasi beranda; login/daftar/reset pada kedua tema.
- `npm run lint`, build mode lokal, dan `git diff --check`: lulus. Warning bundle Vite >500 kB masih ada.
- Full suite terakhir, dengan Chrome: **1.076 lulus, 10 gagal / 1.086 test; 80 file lulus, 4 gagal / 84 file; tanpa skip.** Kegagalan berada pada pekerjaan review transaksi yang sudah dirty sebelum perubahan branding: tambahan `categoryId: null` (9 assertion) dan `.txReviewOptional` tanpa definisi CSS (1 assertion). File-file ini tidak diubah oleh pekerjaan branding.
- Satu pemeriksaan kontras navigasi sempat gagal pada eksekusi awal; eksekusi terarah ulang dan full suite terakhir lulus untuk semua test reference UI. Tidak mengubah palet navigasi untuk menyamarkan hasil tersebut.
- Screenshot aktual header/auth terang dan gelap dibuat lewat Playwright; console page-error kosong.
- Koreksi preview transparansi: crop `.brandTop` awal menyertakan background halaman, lalu ditempel di kanvas abu-abu sehingga tampak kotak. Bukan background pada aset aplikasi. Preview ulang menghapus fill ancestor hanya saat ekspor, menggunakan `omitBackground: true`, dan mempertahankan alpha lewat `alpha_composite`, bukan `convert('RGB')` pada crop.
- Pemeriksaan alpha crop preview awal gagal (seluruh piksel alpha 255), lalu lulus setelah koreksi (range 0–255 pada kedua tema). Kedua PNG sumber aplikasi tidak diubah.
- Test tambahan Chrome membuktikan alpha aset, background CSS button/wrapper/gambar transparan, serta piksel kosong tetap mengikuti dua warna latar berbeda. Pemeriksaan branding terakhir: **12 test / 2 file lulus**, lint lulus; tidak mengulang full suite untuk koreksi preview/test-only ini.

Tidak melakukan push/deploy, sign-in cloud, atau mutasi data produksi. Perubahan deposito/review transaksi yang sudah ada di working tree dipertahankan, bukan bagian dari cakupan branding.
