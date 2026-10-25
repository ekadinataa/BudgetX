# Migrasi visual BudgetX — implementasi lokal

Tanggal: 25 Oktober 2026. Branch: `feat/video-design-production`.
Baseline GitHub terkini: `5084bdc849fcb9eca9cd5165462b28e1f4f3d0f5`
(`[verified] feat(wishlist): add grouped purchase plans with optional notes`).
Baseline saat migrasi visual dimulai: `7176a069bc3ce3a05c67fc0d0160ba263009548f`.

**Status: QA selesai untuk cakupan di bawah; frontend sudah dirilis ke Hosting
production atas permintaan pengguna pada 25 Oktober 2026. Source rilis disimpan
pada branch `feat/video-design-production`.**
Rilis, pemeriksaan cloud-build/live, dan versi rollback tercatat di
[PRODUCTION_RELEASE_2026-10-25.md](PRODUCTION_RELEASE_2026-10-25.md).

## Acuan yang dibekukan

Artifact yang disetujui: `budgetx-video-redesign.html`, bukan export HIG lama.
Bundle referensi diambil lengkap sebelum implementasi. SHA-256:

| File referensi | SHA-256 |
| --- | --- |
| `budgetx-video-redesign.html` | `9b42e183f801ca0f483a85ba941b0c0cae16185f8dc0d79ec5aabf899a32b0e1` |
| `assets/video-refinement.css` | `24739861a04f49d9e6be9002689f250787148571f5eb4d0fb5c5ca8c2cefc787` |
| `assets/video-refinement.js` | `37cacb325e40e2e2df2a62808250dda046073639d04d8c5cccb6d01a956c365b` |

CSS, ukuran, warna, grid, dan screenshot dibandingkan pada viewport yang sama.
Data demo referensi dan produksi berbeda; tidak digunakan pixel-diff seluruh
halaman sebagai klaim kesamaan data atau kesamaan piksel mutlak.

## Pemetaan komponen

| Referensi | Implementasi React / perilaku |
| --- | --- |
| Kanvas hijau pucat, panel, powder-blue KPI, tema gelap | `styles/tokens.css`; semantik foreground/inverted dipisahkan, termasuk radio terpilih dan chat |
| IBM Plex Sans/Mono | `styles/fonts.css`, `public/fonts/`; tanpa request font eksternal; lisensi OFL |
| Navigasi kapsul, dropdown, profil | `components/Topbar/Topbar.jsx`; aktif per grup, outside-click, Escape/focus return |
| Utility rail dan bottom navigation | `components/Sidebar/Sidebar.jsx`; pencarian memfokuskan filter transaksi, compose, tema, bantuan, setelan, logout cloud |
| Aksi di sebelah judul | `context/pageActions.jsx`; inline CSS-grid, bukan portal/efek yang memperbarui state shell |
| Hero sapaan dan timeline | `pages/Dashboard/Dashboard.jsx`; identitas, tanggal, aktivitas dari data aktual |
| Waterfall arus kas | `components/charts/CashFlowWaterfall.jsx`, `utils/cashFlow.js`; maksimum 14 hari aktif, tanpa transfer/adjustment |
| KPI dan aktivitas terbaru | Dashboard; pengeluaran, pemasukan, sisa anggaran, tingkat tabungan; transaksi audit tetap terlihat |
| Dompet: KPI, alokasi, perhatian, account cards | `pages/Wallet/WalletPage.jsx`; `WalletCard` dan semua callback/konfirmasi audit existing dipertahankan |
| Anggaran: summary dan tiga kolom utilization tiles | `pages/Budget/BudgetPage.jsx`; 50 tile, 2%/tile; teks overflow tidak dipotong ke 100%; kontrol tiga mode periode existing tetap ada |
| Laporan: area/garis, ringkasan anggaran, kesehatan | `pages/Reports/ReportsPage.jsx`, `CashFlowTrend.jsx`, `FinancialHealthCard.jsx`; rentang 3/6/12 periode, tooltip pointer/keyboard/Escape |
| Transaksi: rail ringkasan/filter dan daftar/kalender | `pages/Transactions/TransactionsPage.jsx`; filter dan operasi existing tetap utuh |
| Investasi: daftar portofolio dan alokasi | `pages/Investment/InvestmentPage.jsx`; memakai metrik produksi, bukan rumus demo; beli/jual/nilai/riwayat/deposito dipertahankan |
| Wishlist upstream | `pages/Wishlist/`; header/actions ikut grid baru, KPI dan kartu memakai token referensi, gap kolom selaras, dialog memakai panel opaque agar teks latar tidak menerawang |
| Modul lain, modal, auth | Primitive, ikon, kontrol, spacing dan tema global yang sama; tidak mengganti alur bisnis |

Ikon memakai Lucide dengan pemetaan finance-equivalent yang diverifikasi:
dashboard/grid, transaksi/panah, utang/neraca, investasi/tren, aset/rumah,
laporan/batang, bantuan/lifebuoy, Wishlist/list-checks. Tidak menyalin patch DOM, `innerHTML`, state
global, atau override fungsi renderer prototipe.

## Perbedaan yang disengaja dari demo

- Angka tetap memakai mono/tabular sesuai kontrak produksi, walaupun beberapa
  angka pada artifact akhirnya memakai sans. Density dan radius tetap berfungsi.
- Saldo hero diberi nama **saldo bersih**, karena mencakup kewajiban; plafon tidak
  dihitung sebagai aset. Grafik waterfall menjelaskan arus *bersih* harian.
- Editor alokasi kategori tetap melalui modal produksi, bukan autosave DOM
  prototipe. Distribusi 50/30/20 tetap tersedia melalui disclosure.
- Rincian laporan kategori/harian/periode/amortisasi, rekomendasi Dashboard,
  net worth, dan quick actions tetap tersedia di bawah blok utama.
- Kredit/PayLater tetap menampilkan plafon kosong, outstanding, hold, dan limit
  tersedia. Hapus dompet, transfer, alasan audit, saldo concurrent, serta retry
  gagal simpan tetap memakai implementasi existing.
- FIRE tetap kalkulator lengkap dan Bantuan tetap panduan existing.
- Wishlist kini mengikuti implementasi upstream `5084bdc`, menggantikan keputusan
  awal untuk mengecualikannya. Redesign tidak membuat service/schema alternatif
  atau mengubah Firestore rules.

## Integrasi Wishlist dari GitHub

- Fast-forward ke `5084bdc` mempertahankan seluruh redesign lokal. Sebelum merge,
  47 file lokal dan patch biner disalin ke temp sesi
  `budgetx-before-wishlist-20261025-104456/`. Konflik pada Sidebar, Topbar,
  NavIcon, dan CSS sudah diselesaikan; tidak ada unmerged entry.
- Autostash `6cb3c8d` tetap disimpan sebagai cadangan. Perubahannya **sudah**
  dipulihkan; jangan pop lagi di atas working tree ini.
- Desktop: **Perencanaan → Wishlist**. Mobile: **Semua halaman → Wishlist**.
  Pintasan Pengaturan tetap tersedia. Bottom navigation tetap lima slot; item
  dipetakan berdasarkan ID agar penambahan tujuan tidak menggeser Laporan/Settings.
- Grup/item, target dana/tanggal, prioritas, catatan plain-text, validasi,
  pending/error/retry, dirty-dismiss, focus trap/return, dan footer total upstream
  dipertahankan. Tidak ada tombol tambah transaksi di Topbar Wishlist.
- Wishlist menyimpan rencana, **bukan** status pembelian atau dana terkumpul.
  CRUD tidak mengubah dompet, transaksi, atau Budget. Field legacy optional
  `marketplaceName`/`productUrl` tetap dipertahankan saat item lama diedit.
- Penyimpanan lokal dan `users/{uid}/wishlistGroups/{groupId}` memakai App/service
  upstream. Listener independen tetap menunggu snapshot UID yang benar; Append
  ditolak sebelum snapshot otoritatif tersedia. JSON/ZIP, Replace/Append, reset,
  dan migrasi cadangan lama tetap mencakup Wishlist.

## Hasil verifikasi

- Baseline sebelum UI (sebelum integrasi Wishlist): lint/build lulus; 523 test lulus, 8 gagal, 38 skip.
  Delapan kegagalan ZIP berasal dari typed-array lintas realm jsdom; kedua suite
  backup sekarang memakai lingkungan Node seperti suite backup lainnya. Seluruh
  assertion round-trip/audit tetap dipertahankan; kode impor/ekspor tidak diubah.
- **66 file / 904 test lulus; nol gagal dan nol skip** dengan Chrome diaktifkan,
  setelah integrasi Wishlist (sebelumnya 46 file / 587 test).
  Test lama diadaptasi ke navigasi visible dan kontrak visual baru, bukan dimatikan.
- **336 kombinasi halaman/tema/viewport**: 14 halaman × 12 lebar
  (360, 390, 414, 640, 768, 820, 900, 1024, 1280, 1440, 1640, 2000) × light/dark.
  Tidak ada overflow halaman, clipping label yang dijaga, atau exception browser.
- **100 kombinasi form/auth**: 25 fixture × desktop/mobile × light/dark;
  batas panel, overflow isi, dan kontras teks diperiksa. Fixture merekam callback,
  tidak menulis data finansial atau memanggil autentikasi nyata.
- Keyboard menu, Escape/focus return, focus trap modal, tooltip chart, serta
  unduhan CSV periode diperiksa pada 1280 dan 390 px.
- Audit saldo diuji di browser; cloud/real-time/backup tetap diuji dengan mock.
  Unit tambahan menguji batas salary-cycle, deduplikasi periode, signed net flow,
  zero/single-point chart, dan pengecualian transfer/adjustment.
- Audit kontras tambahan sebelum integrasi Wishlist: 91 kombinasi page/theme/density/radius/viewport,
  lebih dari 8.600 sampel teks terlihat. Parser menggunakan canvas sRGB dan
  compositing alpha; bukan menganggap panel transparan sebagai warna opaque.
- Wishlist: 16 skenario browser pada desktop/mobile dan light/dark mencakup
  navigasi, header/grid, CRUD, tanggal tersembunyi, catatan multiline/plain-text,
  field legacy, 40 item berteks panjang, dirty-dismiss, focus trap/return, footer
  tetap terlihat, kontras popup, serta isolasi saldo/transaksi/anggaran.
- Review visual Wishlist tambahan: 20 screenshot (halaman, detail, editor grup,
  editor item, empty state × 1280/390 px × light/dark), 500 sampel teks;
  nol kegagalan kontras/overflow atau exception. Opacity dialog dijaga otomatis.
- Lint dan build lulus. Ekspor single HTML juga dijalankan dari `file://`:
  Dashboard dan Wishlist/detail render, kedua font termuat, tidak ada request jaringan, exception,
  atau overflow. Output uji ditulis ke direktori QA sementara, tidak menimpa
  `../budgetx.html` milik pengguna.

Evidence lokal berada di direktori sementara sesi `budgetx-react-review/`:
32 screenshot reference/React untuk empat halaman utama, `component-comparison.json`,
`contrast.json`, serta tambahan `wishlist-*.png`, `wishlist-visual.json`,
`wishlist-final-tests.json`, dan `wishlist-standalone.json`. Evidence sementara
tidak dimasukkan ke bundle.

## Menjalankan ulang dengan aman

```sh
VITE_FIREBASE_API_KEY='' VITE_FIREBASE_AUTH_DOMAIN='' VITE_FIREBASE_PROJECT_ID='' npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Pada terminal lain, dengan Playwright yang sudah tersedia:

```sh
BUDGETX_PLAYWRIGHT_PATH=/path/to/playwright UAT_URL=http://127.0.0.1:5175 npm test
npm run lint
VITE_FIREBASE_API_KEY='' VITE_FIREBASE_AUTH_DOMAIN='' VITE_FIREBASE_PROJECT_ID='' npm run build
```

Tidak perlu rename atau membaca nilai `.env`. Tanpa Playwright pemeriksaan
browser akan skip: hasil itu **bukan** gate QA penuh.

## Batas verifikasi dan rilis berikutnya

- Hasil ini bukan klaim pixel-identical, sertifikasi WCAG, pengujian screen reader
  manual, atau pengujian semua perangkat nyata. Browser utama yang dipakai Chrome.
- Login/Firestore produksi tidak diuji dengan akun nyata; UAT cloud memerlukan
  emulator/project staging terisolasi. Tidak ada demo yang ditulis ke produksi.
- Masih ada peringatan bundle Vite >500 kB (sudah ada pada baseline), dan warning
  jsdom/Recharts/`act` di beberapa test existing. Tidak dimatikan untuk menyembunyikannya.
- Rilis ini diminta pengguna setelah QA lokal; smoke live hanya read-only tanpa
  akun. Uji cloud dengan akun nyata tetap memerlukan staging terisolasi. Rilis
  berikutnya tetap memerlukan persetujuan; gate lokal hijau bukan izin deploy otomatis.
