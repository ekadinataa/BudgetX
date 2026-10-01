# AGENTS.md — BudgetX (BudgetKu) Money Tracker

Konteks teknis untuk AI agent yang mengerjakan repo ini.
**Produk:** BudgetX — Money Tracker · app budgeting pribadi berbahasa Indonesia.
**Live:** https://budgetx.web.app (target hosting `budgetx`, project `budgetku-app-v1`)

---

## 1. Peta Repo

```
Budget Money Track/
├── budgetku/          ← GIT REPO TERPISAH. Ini yang benar-benar hidup.
├── README.md          ← sudah ditulis ulang (29 Sep 2026)
├── SOP-DEPLOYMENT.md  ← sudah ditulis ulang (29 Sep 2026)
└── budggt_transactions.csv, scraps/  ← data mentah, tidak dipakai app
```

### 🗑️ Dead code yang sudah DIHAPUS (29 Sep 2026)
Folder berikut tidak ada lagi di disk:
- `budgetku-api/` — Express + Supabase. Repo GitHub `ekadinataa/budgetku-api` masih
  ada di luar tapi sudah tidak dipakai; proyek Supabase-nya NXDOMAIN.
- `functions/` (top-level) — Cloud Function wrapper.
- `budgetku/functions/` — 19 file, **pernah ter-track di git `budgetku`**, sudah di
  `git rm --cached` + dihapus dari disk.

Backup source (tanpa `node_modules`, tanpa `.env`) ada di
`/var/folders/.../T/opencode/budgetx-deadcode-backup-20260929` — bersifat sementara,
hilang saat mesin restart.

Kalau nanti butuh referensi arsitektur Express yang lama, ambil dari backup itu atau
dari commit lama — jangan cari di working tree.

> ⚠️ Root `Budget Money Track/` **tidak** punya `.gitignore` sendiri dan outer repo
> `/Kiro-exploit` tidak melacak file di dalamnya.

### Status rilis UI (1 Okt 2026)
Migrasi design system selesai untuk seluruh halaman, dialog, autentikasi, dan
CategoryPicker. Baseline sebelum revamp: `2836b10`.
Repo aktif: `https://github.com/ekadinataa/budgetku`, branch `main`.
Deployment frontend: `firebase deploy --only hosting:budgetx --project budgetku-app-v1`.
Build production membaca `.env.production`; Vite development tetap dapat
berjalan lokal dengan `.env` dinonaktifkan.

---

## 2. Arsitektur

```
React 19 SPA (main.jsx → AuthProvider → App)
   ↓ props (tidak ada router, tidak ada state lib)
App.jsx  ← 1574 baris, SATU-SATUNYA sumber kebenaran
   ↓
services/firestoreService.js  ← semua CRUD, atomic via writeBatch+increment
   ↓
Firebase Auth + Firestore (langsung dari browser)
```

**Keputusan desain yang harus dijaga:**

| Keputusan | Konsekuensi |
|---|---|
| Tanpa React Router | Navigasi = `switch(page)` di `App.jsx:1328`. Tambah halaman = tambah case + item Sidebar. |
| Tanpa state management lib | Semua state di `App.jsx`,diteruskan via props. |
| Tanpa backend server | Firestore diakses langsung dari client. **Jangan usulkan Express/API baru.** |
| CSS global + tokens | Primitive bersama di `base.css`, modifier halaman diberi prefix; tanpa CSS Module. |

### Dual-mode
`const IS_LOCAL_MODE = !firebaseAuth` — `App.jsx:39`, dievaluasi sekali di module scope.
- Tanpa `VITE_FIREBASE_API_KEY` → localStorage saja (`STORAGE_KEY = 'budgetku_state'`).
- Dengan env → Firestore, dan **setiap** handler punya cabang `if (IS_LOCAL_MODE)`.
  Saat menambah CRUD baru, **wajib** dukung kedua cabang.

### Data model
```
users/{uid}/
  wallets/{id}  transactions/{id}  budgets/{monthKey}  categories/{id}
  debts/{id}  investments/{id}  fixedAssets/{id}  subscriptions/{id}
  recurringItems/{id}  preferences/prefs   preferences/fire
```

**KeXA transaksi** (`firestoreService.js:175-337`): `createTransaction` / `updateTransaction` /
`deleteTransaction` WAJIB `writeBatch` + `increment()`.
Update = reverse efek lama (2-3 `batch.update`) lalu apply efek baru.
Hanya `getBalanceEffect()` yang boleh menentukan arah saldo:
`income +amount`, `expense −amount`, `transfer −amount` (sumber) & `+amount` (tujuan).

### Firestore Security Rules
`firestore.rules` — deny-by-default, izinkan hanya `users/{userId}/**` dengan
`request.auth.uid == userId`. Sudah benar dan **sudah ada testnya**
(`src/__tests__/deployment/firebase-config.test.js`). Jangan dilonggarkan.

---

## 3. Design System

**Acuan kebenaran: `../budgetx-revamp/budgetx-app.html`** (iOS HIG / Apple system
look). Revamp 30 Sep 2026 mengganti design system lama ("Ledger") secara penuh.
`../budgetx-revamp/brand-spec.md` dan `budgetx-app-v1.html` **bukan** acuan —
keduanya memakai palet dual-biru yang tidak dipakai `budgetx-app.html`.

| File | Isi |
|---|---|
| `src/styles/tokens.css` | Token iOS/HIG light + dark (`--blue #007aff` / `#0a84ff`, `--red`, `--orange`, `--green`, label/fill/separator bertingkat), skala density `0.84/1/1.16`, radius `0.55/1/1.45`, **+ alias legacy** |
| `src/styles/base.css` | ~250 class global yang diekstrak literal dari `<style>` di `budgetx-app.html`. Ada yang kodenya belum dipakai — itu catatan, jangan dihapus |
| `src/styles/fonts.css` | 4 IBM Plex Mono self-hosted + fallback. UI face = system stack (`-apple-system`), bukan IBM Plex |
| `src/App.css` | Hanya wiring shell: `#root` → `.appShell` (`.appMain` + `.appScroll`) dan hook legacy |

### Aturan yang harus dijaga
**Audit proporsi 1 Okt 2026:** ukuran mengikuti konteks, bukan semua dipaksa
44px. Pada desktop standar: toolbar 36px, form 40px, aksi kartu 32px. Pada
mobile/pointer coarse semuanya memakai target 44px. Token `--control-*` dan
`--space-card`/`--space-stack` adalah sumber ukurannya. `.toolbar` mengatur
`display:flex`, jadi jangan digabung dengan kelas grid. Semua halaman, dialog,
autentikasi, dan CategoryPicker memakai kelas global. Migrasi CSS Module
selesai: nol file/impor `.module.css` dan nol referensi `styles.*` di komponen.

Preset harus ditulis `:root[data-density='…']` / `:root[data-radius='…']`.
Selector nested di dalam `:root` akan menargetkan keturunan, sementara atribut
berada di `<html>` sendiri — pilihan kerapatan/sudut jadi tidak bekerja.

1. **Pakai class global `base.css` dulu** untuk komponen baru, bukan CSS Module
   baru. Kalau `base.css` belum punya class yang cocok, tambahkan di sana dengan
   nilai dari referensi — jangan mengarang token warna.
2. **Nol hex di JSX & CSS Module.** Semua dari `tokens.css`. Pengecksiannya:
   `grep -rnE "#[0-9A-Fa-f]{6}|rgba?\(" src --include=*.jsx` → yang boleh
   tersisa hanya palet data tersimpan (lihat aturan 8).
3. **Pilih token sesuai perannya, bukan hanya sesuai warnanya.** Setiap hue punya
   tiga bentuk, dan mencampurkannya adalah sumber kontras buruk yang paling
   sering:

   | Peran | Token | Contoh |
   |---|---|---|
   | Isian besar / chart / titik | `--hue` | `background: var(--green)` |
   | Teks | `--hue-ink` | `color: var(--green-ink)` |
   | Latar bertint | `--hue-soft` | `background: var(--green-soft)` |
   | Permukaan yang membawa teks putih | `--hue-fill` | `background: var(--red-fill)` |

   `-fill` hanya ada untuk `blue`/`green`/`red`/`orange` (referensi hanya
   menyediakannya untuk biru). Itu karena `-ink` **membalik** jadi nilai terang
   di dark theme, jadi tidak bisa membawa teks putih di kedua tema —
   putih di `--orange-ink` dark cuma 1.78:1. Jangan pakai `-ink` untuk
   `background` tombol.

   Warna transparan: pakai pasangan `-soft`. **Jangan `color + '18'`** — suffix
   alpha hanya jalan untuk hex; begitu `color` jadi CSS var hasilnya invalid.
4. **Pemappearance hidup di `<html>`, bukan di state React:**
   `data-theme` · `data-density` · `data-radius` · `data-collapsed`.
   `ThemeContext` hanya menulis atribut itu, **tidak boleh** inject custom
   property inline (ada test yang menjaganya). `[data-collapsed]` juga
   mengatur lebar sidebar + visibilitas label tanpa re-render.
5. **Angka pakai `--font-mono` + `tabular-nums`** (kelas `.num`).
6. **Ikon lewat `components/icons/NavIcon.jsx`** (Lucide). Kalau sebuah nama
   tidak ada di map, komponen diam-diam render `null` — cek map-nya, jangan
   mengarang nama. Ada check di Section 7.
7. **Alias legacy di `tokens.css`** dipertahankan untuk gaya inline lama.
   `--text-3` dan `--text-5` mengarah ke `--label-2`,
   `--text-4` ke `--gray-ink`. `--text-6` adalah separator: hanya untuk dekorasi,
   bukan teks. Gunakan `--label-2` untuk keterangan kecil dan `--label` di atas
   isian gelap seperti `--surface-3`. Hapus alias setelah semua pemakai pindah.
8. **Nilai warna yang tersimpan ke Firestore harus tetap hex.** Ini pengecualian
   yang disengaja dan mudah dilanggar oleh refactor warna:
   - `SettingsPage.jsx` → `COLORS` (pilihan warna kategori)
   - `SettingsPage.jsx` → `DEFAULT_CATEGORY_COLOR` (kategori baru)
   - `Budget/SectionEditModal.jsx` → palet warna section
   - `Wallet/WalletFormModal.jsx` → warna per tipe dompet

   Nilai-nilai ini ditulis ke dokumen lalu dirender apa adanya. Mengikatnya ke
   `var(--blue)` akan menulis ulang data setiap kali tema berubah dan membuat
   warna berbeda antar perangkat. Kalau `cat.color` mau dipakai sebagai
   **dekorasi** (mis. tint ikon), itu aman; sebagai **teks** tidak — warna
   kategori dipilih user dan bisa pastel.

### Pola header yang dipakai di seluruh app
| Kebutuhan | Markup |
|---|---|
| Judul halaman | `.largeTitleBlock` > `.largeTitle` + `.pageSubtitle` |
| Judul kartu simple | `<h2 class="sectionTitle">` (uppercase, `--label-2`) |
| Judul kartu + subjudul + aksi | `.cardHead` > `.cardTitle` + `.cardSub` + aksi |
| Judul dengan ikon | `SectionTitle` di `pages/Dashboard/ScoreParts.jsx` (`variant="card"` untuk yang punya subjudul) |
| Judul + tombol | `.seg` (Bulan Ini / Tahun Ini) |

### Shell
```
.appShell > Sidebar + .appMain
  .appMain  > Topbar (sticky) + .appScroll   ← yang di-scroll
    .appScroll > .container > renderPage()
```
**Yang di-scroll adalah `window`, bukan `.appScroll`.** `.shell` cuma
`min-height: 100vh` dan `.main` tidak dikunci, persis seperti referensi — jadi
sidebar dan topbar menempel ke viewport. `.appScroll` karena itu **bukan**
scroll container (cuma `overflow-x: clip` untuk menahan melebar). Konsekuensi:
`Topbar` untuk `data-scrolled` harus baca `window.scrollY > 18`, bukan
`addEventListener('scroll')` di `.appScroll` — yang itu tidak pernah fire.
Referensi juga tidak mendefinisikan `--tabbar-h`; `base.css` menambahkannya
dengan nilai `0px` di desktop dan `52px` di `≤768px`, karena apa pun yang
harus menyingkir dari tab bar (launcher HelpChat, padding bawah scroll) butuh angkanya.

### Lebar konten per halaman
`--container-max` di referensi dikunci `1180px`. Itu pas untuk laptop, tapi di
monitor 2000px membuang **32%** lebar layar (gutter 280px per sisi). Tiga lapis:

| Lapis | Nilai | Untuk |
|---|---|---|
| container | 1180 → 1320/1480/1600 pada ≥1400/1640/1880 | batas atas, naik bersama jendela |
| `.pageWide` | `min(1360px, --container-max)` | tabel & daftar |
| `.pageMeasure` | `min(920px, --container-max)` | form & teks panjang |

`min()` dipakai supaya kelas-kelas ini **hanya bisa mempersempit**, tidak
pernah meluber di jendela kecil. Peta halaman → kelas ada di `PAGE_MEASURE`
(`App.jsx`); `dashboard` sengaja tidak dipetakan karena dia punya grid
dua kolom sendiri dan memang mau lebar penuh.

`fire` dan `help` tetap `pageMeasure` dan **akan** terlihat "terperah" di layar
2000px — itu memang pilihan yang benar (form panjang dan teks baca, keduanya
tidak terbaca di 1600px), dan container-nya dipusatkan supaya ruang kosongnya
terlihat sebagai margin yang disengaja, bukan bug.

**Keseimbangan kolom dashboard:** "Transaksi Terbaru" pernah ada di rail kanan.
Kolom kiri jadi 501px vs kanan 1202px, dan halaman terlihat miring setengah.
Baris transaksi adalah konten terlebar di dashboard, jadi pindah ke kolom kiri.
Rail kanan jadi `position: sticky` (hanya di ≥1024px) supaya skor tetap terlihat
saat kolom lebar di-scroll.

### Pengeksian visual
Playwright (Chrome, bukan Chromium) dipakai untuk dua hal, keduanya harus
lulus sebelum commit:
1. **Responsif** — 13 halaman × 12 viewport (2000→360): nol overflow horizontal,
   nol teks tergencet, nol label terpotong (`scrollWidth > clientWidth`), dan
   nol konten "terperah" (container < 60% lebar available). Pengecualian yang
   disahkan: `fire` dan `help`, yang memang `pageMeasure`.
2. **Kontras** — 5 varian tema (light/dark × 3 density × 2 radius) × 13 halaman,
   mengukur rasio WCAG AA. Compositing alpha background wajib, kalau tidak
   `rgba(118,118,128,.12)` dianggap opaque dan hasilnya false positive di
   mana-mana. Emoji harus dikecualikan (piktogram, bukan teks).

   **Pengecualian yang diketahui:** `.tag` ("6 dompet") di `balanceCard` = 4.47:1
   di dark mode, 0.03 di bawah 4.5. Itu nilai referensi apa adanya
   (`--label-2` di atas `--fill-tertiary`) dan sengaja tidak diubah.

## 4. Komponen Inti

| Path | Peran |
|---|---|
| `src/App.jsx` | State global, semua CRUD handler, routing via switch, gating auth. |
| `src/services/firestoreService.js` | 41 export CRUD. Layer data tunggal. |
| `src/services/validator.js` | Validasi sebelum write. Batas string 1000 char. |
| `src/services/importService.js` | Parse & validasi import JSON/CSV/ZIP. |
| `src/services/exportService.js` | Export JSON & CSV-ZIP (fflate). |
| `src/utils/` | 12 file logika bisnis **murni** — mudah diuji. |
| `src/data/defaults.js` | 6 dompet + 34 transaksi + budget + 18 kategori sample. |
| `src/data/holidays.js` | Hari libur Indonesia 2024–2030. **Pakai `isHoliday()`.** |
| `src/components/HelpChat/` | 10 FAQ hardcoded. **Bukan AI, tidak ada network call.** |

### 13 Halaman (nilai `page`)
`dashboard` · `wallet` · `tx` · `budget` · `recurring` · `subscription` · `debt` ·
`invest` · `asset` · `report` · `fire` · `settings` · `help`

---

## 5. Command

```bash
npm run dev         # Vite dev server :5173
npm run build       # → dist/  (butuh @rolldown/binding-<platform>!)
npm run build:single # build + inline dist/ → ../budgetx.html (1 file mandiri)
npm test            # vitest --run (23 file; browser checks optional)
npm run lint        # ESLint flat config
npm run preview     # serve build
```

Pemeriksaan browser membutuhkan Vite yang aktif pada `UAT_URL` (default
`http://localhost:5173`) dan Playwright. Jika Playwright terpasang di lokasi
eksternal, jalankan test dengan `BUDGETX_PLAYWRIGHT_PATH=/path/to/playwright`.
Tanpa Playwright, hanya pemeriksaan browser yang di-skip; unit/style test tetap
berjalan. Fixture `src/__tests__/layout/modal-fixtures.jsx` tidak menulis data,
dan tidak diimpor oleh bundle produksi.

### Single-file build
`scripts/build-single-html.mjs` men-inline `dist/` (JS, CSS, logo) jadi satu
`<head>`-only HTML yang jalan dari `file://`. Dijaga
`src/__tests__/deployment/single-html-build.test.js`. Dua jebakan yang sudah
terkena dan tidak boleh dilupakan kalau skrip ini diedit ulang:
- Semua `String.replace` **wajib** function replacer. Bundle minified penuh
  `` $` ``/`$&`; sebagai string replacement pola itu ekspansi jadi HTML sekitar.
- `/logo.png` di 5 komponen ditulis ulang ke global `__BUDGETX_LOGO__`; kalau
  dibiarkan, logo 404 saat file berdiri sendiri.
- `</script` di dalam bundle wajib di-escape → `<\/script`.

### 🚨 Setup trap: native binding
`npm run build` dan `npm test` **gagal total** tanpa binding Rolldown native.
Gejala: `Cannot find module './rolldown-binding.darwin-arm64.node'`.

**Jangan** hapus `package-lock.json` — di dalamnya sudah ada entry yang benar untuk semua
platform. Cukup pasang binding yang kurang:

```bash
npm install --no-save @rolldown/binding-darwin-arm64@<versi yg sama dgn rolldown>
```

Cek versinya: `node -p "require('./node_modules/rolldown/package.json').version"`.
Hindari `--force` / `rm -rf node_modules` (npm optional-deps bug, bisa bikin lockfile rusak).

---

## 6. Test Suite

23 file, **412 test termasuk browser — semua hijau** (per 1 Okt 2026). `setup.js` hanya berisi
`import '@testing-library/jest-dom'`.

| Kategori | File | Catatan |
|---|---|---|
| Property-based (fast-check) | 6 file, `numRuns: 100` | helpers, formatters, wallet, transactions, budget, persistence |
| Unit | validator (104), firestoreService (51), helpers (41) | |
| Komponen | ui (23), Sidebar (10), ThemeContext (8) | |
| Deployment | firebase-config (9), single-html-build (6) | Baca `firebase.json`/`.firebaserc`/`firestore.rules` dari disk; single-html-build skip kalau `dist/` belum ada |

**Mock Firebase** di `firestoreService.test.js:12-53` — `vi.mock` 3 modul
(`firebase/firestore`, `../../config/firebase`, `../../data/defaults`).
`writeBatch` = `mockBatch` dengan `vi.fn()` per method; `increment(n)` = tag object
`{_type:'increment', value:n}`. `config/firebase` dimock jadi
`auth.currentUser.uid === 'test-user-123'`.

### Test yang sudah diperbaiki (29 Sep 2026)
Semuanya gagal karena test usang vs. perubahan WIP — testnya yang salah, bukan kodenya:
- `hooks/useLocalStorage.test.js` — **dihapus**. Hook-nya sudah dihapus dari app,
  test ini yatim (tidak ada kode yang diuji). Coverage localStorage tetap ada di
  `logic/persistence.test.js`.
- `deployment/firebase-config.test.js` — `hosting` di `firebase.json` adalah
  **array** (2 site: `budgetx` target + `budgetku-app-v1` legacy). Test sekarang
  mencari entri `target === 'budgetx'` dan menambah assertion untuk redirect 301.
- `components/ui.test.jsx` — assertion `borderRadius === '8px'` sudah di-hardcode ke
  nilai kosmetik. Diganti dengan assertion yang menguji **perilaku merge** (custom
  style menang, base style tetap ada) supaya tahan perubahan desain.
- `components/Sidebar.test.jsx` — bottom nav Mobile di-redesign jadi 5 slot
  (4 item + FAB tengah), bukan duplikat penuh sidebar. Test sekarang moralsesuai:
  4 label nav (`Dashboard`/`Transaksi`/`Laporan`/`Pengaturan`) muncul 2×,
  7 label sidebar-only muncul 1×, plus assert `aria-label="Tambah Transaksi"`.

---

## 7. Status Saat Ini (hasil verifikasi 29 Sep 2026, setelah perbaikan)

| Cek | Hasil |
|---|---|
| `npm run build` | ✅ sukses |
| `npm test` dengan Playwright | ✅ **412/412 pass**, 23/23 file (1 Okt 2026) |
| `npm run lint` | ✅ **0 error, 0 warning** |

### ✅ Sudah diperbaiki
1. **Build blocker** — `src/data/holidays.js` terhapus tapi masih di-import
   (`utils/periodAdjuster.js:12` → `helpers.js:10` → dipakai 3 halaman).
   Konsekuensinya **seluruh app gagal compile**. Fix: `git checkout -- src/data/holidays.js`.
2. **`node_modules` rusak** — native binding Rolldown tidak terinstal, build & test
   crash saat startup. Fix: pasang `@rolldown/binding-darwin-arm64` saja.
3. **6 test failure** — semua drift test vs. WIP. Detail di Section 5.
4. **Dead code dibersihkan** — 3 folder backend dihapus (163MB).
5. **Docs ditulis ulang** — `README.md` root & `SOP-DEPLOYMENT.md` sekarang
   menjelaskan arsitektur client-side yang benar.
6. **ESLint 53 error → 0** — detail di bawah.

### ✅ ESLint cleanup (53 error + 1 warning → 0)
Dipisah jadi 4 kategori, sengaja **tidak** memakai blanket disable:

**a. Config (13 error sekaligus).** `no-unused-vars` sekarang pakai
`ignoreRestSiblings: true` di `eslint.config.js` — mengizinkan pola idiomatik
`const { dropped, ...rest } = obj` (dipakai `App.jsx` untuk budget map, dan test
yang membuang field sebelum validasi). Plus `react-refresh/only-export-components`
dimatikan khusus `src/context/*.jsx` (file context memang mengekspor Provider +
hook `use*`; memecahinya jadi file terpisah cuma churn).

**b. Dead code (~20 error).** Import tak terpakai (`applyPayment`, `fmtDate`,
`getWalletById`, `sectionColor`, `increment` di mock test), prop mati
(`Calendar.wallets`, `AssetPage.setPage`, `ReportsPage.wallets`,
`StatCard.icon`, `WalletPage.categories` — dihapus juga dari call site `App.jsx`),
state mati (`ReportsPage.viewMode`, `SettingsPage.walletImportData`), dan
`catch (err)` → `catch {}`.

**c. `set-state-in-effect` (3 → 1).** Semua diperbaiki dengan **menurunkan state**
alih-alih menyimpannya, bukan menambah effect:
- `AuthContext`: `loading` = `auth ? !authResolved : false` (dulu `setLoading(false)`
  sinkron saat `auth === null`).
- `BudgetPage`: `selectedRangeId` diturunkan dari `rangeOverride` + `findActiveRange`;
  state disimpan hanya untuk pilihan eksplisit user. Efek auto-select dihapus.
- `App.jsx`: `showMigrator` diturunkan dari `user && !authLoading && !migrationChecked
  && localStorage punya data`. Efek + `setShowMigrator` dihapus.
- Tersisa 1 yang **memang benar** pakai effect: `fetchAllData()` di-effect auth.
  Effect itu memang benar — pemicunya sistem eksternal (Firebase auth), bukan state turunan.
  Ditutup `eslint-disable-next-line` + komentar alasannya.

**d. `react-hooks/immutability` di `charts/PieChart.jsx`.** `angle += a` di dalam
`.map()` diganti akumulasi `reduce` (titik awal dihitung dari segmen sebelumnya).
Diverifikasi ekuivalen: **7200 kasus acak, 0 mismatch** jalur SVG.

**e. `exhaustive-deps` di `TransactionsPage`.** Predikat `matchesDate` dipindahkan
ke dalam `useMemo` agar deps-nya jujur. Diverifikasi: **1024 kasus, 0 mismatch**.

> Catatan: `TransactionsPage`, `BudgetPage`, `App.jsx`, `AuthContext`, dan `PieChart`
> **tidak punya test**. Saat mengubahnya, cara yang dipakai adalah: buktikan
> ekuivalensi secara eksplisit (seperti 2 checks di atas atau smoke test sementara),
> jangan mengandalkan "testsuite hijau" sebagai bukti.

### 🟠 Gap tooling yang ditemukan (belum diperbaiki)
**ESLint tidak menangkap komponen JSX yang tak terdefinisi.** `no-undef`
tidak aktif untuk identifier yang dipakai sebagai `<Tag />`, jadi
`<NavIcon name="check" />` di `AssetPage.jsx` **lolos `npm run lint` dan
`npm run build`** dan baru meledak saat runtime sebagai
`ReferenceError: NavIcon is not defined`. Refactor seperti ini bisa lolos
semua gate statis dan hanya muncul saat user membuka halamannya.

Perbaikannya butuh `eslint-plugin-react` dengan setting `react/jsx-no-undef`,
atau test render per halaman. `App.jsx`, `TransactionsPage`, `BudgetPage`,
`Dashboard` dan `FirePage` **tidak punya test komponen sama sekali**, jadi
satu-satunya jaring pengaman mereka Playwright.

### 🟠 Jebakan collapsed-sidebar (melewati test jsdom)
Dua bug ini lolos `npm run lint`, `npm test`, **dan** `npm run build`, dan baru
terlihat saat user dilaporkan — karena jsdom tidak pernah menerapkan
`base.css`, jadi aturan `@media`/`[data-collapsed]` tidak pernah diuji.

1. **Aturan hide yang terlalu luas.** Referensi menulis
   `[data-collapsed='true'] .sidebarAction span { display: none; }` — selector
   payung. Di sana aman karena markup-nya menaruh ikon sebagai anak langsung
   `<button>` (bukan di dalam span). Ours membungkus ikon dengan
   `<span class="navIcon">`, jadi aturan yang sama ikut menyembunyikan ikon:
   ketiga tombol footer (Keluar / Mode / Ciutkan) render **seluruhnya kosong**
   di rail 72px. Perbaikannya bukan menirusi ikon ke luar span, tapi memberi
   kelas pada teksnya (`.sidebarActionLabel`) lalu mengganti selector payung
   itu — jadi kalau aturannya kembali, test langsung gagal.
2. **`.navGroupLabel` tidak pernah disembunyikan saat collapsed.** Group header
   tetap dirender di rail 72px: "Ringkasan" butuh 85px dalam kotak 47px, jadi
   terpotong jadi "RINGKA". Ini **bug di file referensi itu sendiri**; kita
   menyimpang dengan menyembunyikan teksnya dan memberi garis pemisah per grup
   (`.navGroup ~ .navGroup`), karena menyembunyikannya saja akan meratakan
   keempat grup jadi satu daftar panjang.
   Wrapper `class="navGroup"` ditambahkan khusus untuk itu.

Verifikasi collapsed **wajib** di Playwright (tabel 2 state × 8 lebar), bukan
hanya andalkan test. Ditambah guard `clipped` di sweep responsif: cek
`scrollWidth > clientWidth + 1` untuk `.navGroupLabel`/`.navLabel`/
`.sidebarActionLabel`, bukan cuma "lebar < 26px" seperti heuristic lama yang
buta terhadap pemotongan di tengah kata.

### 🟠 Migrasi CSS Module → `base.css`: jebakan yang sudah terjadi
Sesi 30 Sep 2026 memindahkan halaman ke class global. Empat dari empat kegagalan
tersembunyi — lolos lint, lolos build, lolos hitung-kelas — dan sekarang ditutup
`src/__tests__/styles/global-classes.test.js` (5 test). **Jangan salin CSS
verbatim.**

1. **Lift verbatim menimpa selector yang sudah ada.** Menyalin 913 baris
   `BudgetPage.module.css` ke `base.css` menimpa **24** selector, termasuk
   `.allocBar` milik referensi — baris angka kecil di `.catRow` yang berubah
   jadi bar status bertint 22px. Gejalanya tidak error, hanya "kelihatan
   salah". Perbaikannya: lift **per rule**, lewati yang bentrok, lalu arahkan
   JSX ke class yang benar-benar ada.
2. **Nama yang Similar bukan nama yang sama.** Bar status bertintbagian diberi
   `.allocStatus*`, tapi hanya `.allocBar*` yang ter-lift, jadi third variant
   (`allocStatusValue`) tidak punya CSS sama sekali. Yang hilang justru saat
   **deduplikasi**: `str.replace(a, b)` tanpa `count` menghapus **semua**
   kemunculan, termasuk `.radioGroup` asli milik referensi, plus
   `.tableCompact` / `.tableRowMuted` / `.ratioRow` yang ditambahkan di sesi
   yang sama. Cek ulang semua class lifestyle setelah dedupe.
3. **Regex selector-nya menelan komentar.** `^([^\s@}][^{]*?)\{` mencapture
   baris `/* ── Judul ── */` sebagai prelude, hasil keluarnya `./* ── Judul ── */`
   dan **build gagal** di minifier (`Expected identifier in class selector`).
   Saring komentar dulu.
4. **`min-width: auto` membatalkan `text-overflow`.** `.itemName` punya
   `ellipsis` tapi lebarnya **0px** — sebagai flex item, `min-width` default
   `auto` = lebar konten, jadi barisnya melebar sampai nama menyusut ke nol dan
   **terpotong**, bukan terellipsis. Perlu `min-width: 0` di `.itemName` **dan**
   di `.listRow`-nya. Fix sama untuk `.listRow:has(.allocInput)` yang jadi dua
   baris di bawah 480px (nama + input 104px + dua tombol 44px ≈ 240px).
5. **Guard kontras salah bisa.bohong.** `.sep` dilaporkan "undefined" padahal
   ada sebagai `.sectionSpent .sep` — versi `definedClasses` hanya membaca
   segmen pertama selector. Dan `className="sep"` berisi teks `"/"` lolos filter
   karena `{'a / b'}` ikut diambil sebagai class. Dua-duanya sudah dikoreksi di
   test; kalau test ini nanti gagal, perbaiki **test atau CSS-nya** — jangan
   whitelist-kan.

`Input`/`Select` sekarang memakai `.inputField`, tanpa default inline.
Modifier seperti `.allocInput` bisa mengatur lebar/tinggi lewat CSS. Jika
CSS Module mengomposisi kelas global lalu mengubah properti yang sama, gunakan
selector modifier yang lebih spesifik; jangan bergantung pada urutan import.

### 🟠 Jebakan yang sudah terjadi saat revamp 30 Sep 2026
Semua sudah diperbaiki, tapi polanya mudah terulang:

1. **Nama ikon yang tidak ada di map `NavIcon` render `null` diam-diam.**
   Tidak ada error, tidak ada warning — ikonnya cuma hilang. Yang ditemukan:
   `bolt` (Zap) dan `info` untuk Aksi Cepat + Rekomendasi, plus
   `<NavIcon name={r.tone} />` di daftar Rekomendasi yang mengoper tone
   (`Sehat`/`Perhatian`/`Bahaya`) sebagai nama ikon. Pola yang benar: petakan
   tone → ikon (`tone === 'Sehat' ? 'check' : 'warning'`).
   **Cek:** `grep -oE 'name="[a-zA-Z]+"' src/**/*.jsx` lalu bandingkan dengan
   key di `src/components/icons/NavIcon.jsx`.
2. **`color + '18'` untuk warna transparan.** Hex `+ '18'` (suffix alpha)
   bekerja, `var(--x) + '18'` tidak — hasilnya CSS invalid dan warnanya hilang.
   Gunakan pasangan `-soft` yang sudah ada di `tokens.css`.
3. **Satu warna untuk dua peran.** Referensi pakai satu hex untuk arc donat
   *dan* teks grade. Di sistem token HIG, `-ink` (teks) terlalu gelap untuk
   arc tebal dan `-fill` terlalu terang untuk teks. `computeHealthRatios`
   sekarang mengembalikan tiga: `ring` / `ink` / `soft`.
4. **Threshold skor diduplikasi.** `ScoreDonut` punya ambang sendiri (70/40)
   sementara `computeHealthRatios` pakai 80/60/40 — bisa tampil hijau tapi
   tulis "Perlu Perhatian". Sekarang donat menerima `grade.ring`.
5. **Nesting `scoreInfo`.** Teks harus di dalam `scoreInfo` yang dimensinya
   sibling dari `scoreCircle` di dalam `scoreHero`. Kalau `scoreInfo` membungkus
   keduanya, kolom teksnya sempit sekali.
6. **Event scroll di `window`.** Yang ter-scroll adalah `.appScroll`, jadi
   `Topbar` `data-scrolled` harus dengar `scroll` di elemen itu.
7. **Handler yang meneruskan event ke prop bertipe data.**
   `onClick={onAddTx}` mengirim `MouseEvent` sebagai argumen pertama — kalau
   signature-nya `onAddTx(type = 'expense')`, event itu jadi `type`. Bungkus
   `onClick={() => onAddTx()}`.

### 🟠 Gap yang ditemukan saat cleanup (belum diperbaiki)
`validateInvestment(data, hasTransactions)` punya param `hasTransactions` yang tidak
pernah dipakai. Param itu dihapus, tapi gap aslinya dicatat di JSDoc: **assetType
hanya terlindungi di UI** (`InvestmentFormModal` men-disable select saat sudah ada
transaksi). `App.jsx` `handleUpdateInvestment` tidak memvalidasi sama sekali, jadi
update di luar form itu tidak punya guard. Perbaikannya butuh parameter tambahan
(original assetType) — di luar scope lint cleanup.

---

## 8. Menjalankan App Lokal & UAT

### Dua mode
| Mode | Pemicu | Persistensi | Risiko |
|------|--------|-------------|--------|
| **Lokal** | `VITE_FIREBASE_API_KEY` kosong | `localStorage['budgetku_state']` | Nol — tidak menyentuh Firebase |
| **Cloud** | env terisi | Firestore `users/{uid}/...` | Data masuk ke project Firebase |

### ⚠️ PENTING untuk UAT
`budgetku/.env` menunjuk project **`budgetku-app-v1`** — project yang **SAMA dengan
produksi**. Jadi kalau dev server jalan dengan env aktif, setiap transaksi yang kamu
buat saat UAT akan **permanen tersimpan di database produksi**.

Rules Firestore mengisolasi per-`uid`, jadi akun existing tidak akan ikut berubah —
tapi data uji tetap menetap di DB produksi dan tidak ada cara menghapusnya dari UI.

**Untuk UAT fungsional, pakai mode lokal:**
```bash
cd budgetku
mv .env .env.disabled     # → auth/db = null → localStorage only
npm run dev
```
**Untuk UAT integrasi cloud (login + sync), pakai akun sekali pakai** dan env aktif:
```bash
mv .env.disabled .env
npm run dev               # daftar akun baru; data test masuk ke users/{uidBaru}
```

Verifikasi mode aktif tanpa membuka browser:
```bash
curl -s localhost:5173/src/config/firebase.js | head -1 | grep -q VITE_FIREBASE \
  && echo "CLOUD — hati-hati, nulis ke Firestore" \
  || echo "LOKAL — aman, hanya localStorage"
```

### Komandan
```bash
npm run dev      # http://localhost:5173, HMR
npm run preview  # serve hasil build di :4173
```

### Hasil verifikasi runtime (29 Sep 2026)
Ditulis sebagai smoke test sementara lalu dihapus (App tidak punya test):
- `App` mount tanpa crash di local mode; `<main>` + `<aside>` ter-render
- localStorage terisi: 6 dompet, 18 kategori, transaksi seed
- **13 halaman render tanpa crash** (dashboard, wallet, tx, budget, recurring,
  subscription, debt, invest, asset, report, fire, settings, help)
- Tidak ada error/warning React saat mount
- Dark mode: `data-theme="dark"` + `--bg: #0D1117` terpasang
- 8 modul utama ditranspile dev server tanpa error

> jsdom butuh polyfill `ResizeObserver` untuk halaman `fire` (recharts
> `ResponsiveContainer`). Browser asli sudah punya — ini gap test environment saja.
- Semua temuan di Section 7 masih terbuka (module-level `TODAY`, `c1` hardcode,
  substring error mapping, dst.).

---

## 9. Temuan Teknis Penting (untuk Hindari Pengulangan)

### ✅ Terverifikasi: Supabase sudah MATI & sudah dibersihkan
Bukti (semua dicek langsung, 29 Sep 2026):
- `grep -ri supabase src/` → **nol hasil**. Nol referensi di seluruh app.
- `@supabase/supabase-js` **tidak terinstall** di `node_modules`.
- `.env` hanya berisi 3 `VITE_FIREBASE_*`. Tidak ada `VITE_API_URL`.
- `firestoreService.test.js:164` **secara aktif meng-assert** source code tidak boleh
  mengandung `VITE_API_URL` — "hapus backend" adalah keputusan yang diuji.
- Proyek Supabase `biandalkagxmsretpppa.supabase.co` → **NXDOMAIN** (DNS sehat,
  subdomain acak juga NXDOMAIN, `supabase.co` resolve normal → project dihapus/di-pause).
- Repo GitHub `ekadinataa/budgetku-api` publik tapi `.env` **tidak** ter-expose (404).
  Tidak pernah ada kebocoran kredensial.
- ✅ Ketiga folder dead code **sudah dihapus** (lihat Section 1).

### 🟠 Catatan pola dari kode lama (sudah dihapus — jangan disalin)
Tersimpan hanya sebagai pelajaran kalau someday butuh backend lagi:
- `budgetku-api/src/routes/transactions.js:258-279` — `adjustWalletBalance` adalah
  read-modify-write **tidak atomik** (komentar di `:79` mengklaim ada RPC; tidak ada).
  Race → saldo korup permanen. `firestoreService.js` sudah benar pakai batch+increment.
- `functions/index.js:24` — `cors({ origin: true, credentials: true })` mencerminkan
  origin sembarang.
- `importService.js:631` — `unzipSync` tanpa batas → **zip-bomb**. Limit 10MB hanya di
  UI (`SettingsPage.jsx:9`) dan mengukur ukuran **terkompresi**.
- `PaymentModal` hitung bunga flat `sisa × rate/12`, bertentangan dengan
  `generateAmortizationSchedule` yang dipakai di kartu yang sama.

### 🟠 Middle
- **Module-level `TODAY`** di 5 file: `DebtPage.jsx:16`, `InvestmentPage.jsx:19`,
  `BuyModal.jsx:10`, `SellModal.jsx:11`, `DebtWidget.jsx:5`. Di-evaluasi saat import →
  tab yang kebuka semalaman memakai tanggal kemarin. Pakai `new Date()` per render.
- `TxFormModal.jsx:33` hardcode `categoryId: 'c1'`.
- `DebtFormModal.jsx:58-64` & `InvestmentFormModal.jsx:49-51` — pemetaan error dengan
  `error.includes('Nama')`. Ubah teks validator = patah diam-diam.
- `App.jsx:194` `prefsInitialized = !dataLoading && user` — `dataLoading` masih `false`
  sebelum `fetchAllData` mulai, jadi preferensi bisa ditulis di paint pertama (race
  dengan `setDoc` initial).
- `App.jsx:1299-1322` `apiSetWallets/apiSetTransactions/apiSetCategories` — namanya
  seolah mem-route lewat API, tapi kedua cabangnya identik (`setState` biasa). Tidak perlu.
- `App.jsx:1187-1192` & `1234-1241` — "rollback" import tidak pernah terpicu
  (React setter tidak melempar exception). Branchnya teater.
- `DataMigrator.jsx:17,27` — baca localStorage & panggil `onComplete()` **saat render**.
  Render-phase side effect.
- Laporan & Dashboard memfilter/menjumlahkan seluruh array transaksi tiap render tanpa
  `useMemo`. Akan melambat pada data besar.
- `BudgetPage.jsx:503` — `getAmortizedBySection` dihitung 3× dalam satu `.map()`.
- `FirePage.jsx:57` — debounce 500ms bergantung pada identitas `onSaveFireSettings`,
  sedangkan `App.jsx:1125` tidak di-memoize → timer ter-reset tiap render App.

### 🟢 Minor
- `components/ui/SectionPill.jsx` mati (hanya dipakai test). CSS var
  `--tx-badge-*` & `--section-pill-*` hanya ada di blok dark theme.
- `AmountText` pakai `var(--amount-*, fallback)` — 3 var itu tidak pernah didefinisikan.
- Keyframes `countUp` & `slideInRight` di `App.css` tidak pernah dipakai.
- `StatCard` menerima prop `icon` tapi tidak merender.
- 4 file `components/charts/` ternyata SVG/div buatan sendiri, bukan recharts.
  Recharts hanya dipakai di `FirePage`.
- `DebtPage.jsx:194`, `InvestmentPage`, `RecurringPage`, `SubscriptionPage` —
  card component ditulis inline di file yang sama, bukan file terpisah.
- HelpChat Bilang ketik `"RESET"`, tapi `ResetConfirmModal.jsx:26` mewajibkan `"Delete"`.
- `UpdateValueModal` hanya bisa dibuka untuk aset **non-deposito** → deposito tidak
  bisa di-refresh manual.
- Aksesibilitas: kartu utang/aset/transaksi = `<div onClick>` tanpa `role`/`tabIndex`.
  `Modal` tidak punya focus trap atau scroll lock.
- Tidak ada `dangerouslySetInnerHTML` di seluruh `src/` — aman dari XSS.

---

## 10. Aturan Kerja Sama

1. **Jangan usulkan backend/API baru.** Firestore client SDK adalah arsitektur yang
   disengaja; ada test yang secara aktif memastikannya (`firestoreService.test.js:164`).
2. **CRUD baru wajib dua jalur:** `IS_LOCAL_MODE` (localStorage) + Firestore.
3. **Saldo wallet hanya boleh diubah lewat `writeBatch` + `increment()`** di
   `firestoreService.js`. Jangan pernah menulis `balance` langsung.
4. **Logika bisnis di `utils/`, bukan di komponen.** Sudah pure & teruji.
5. **Semua teks UI berbahasa Indonesia.** Format IDR & tanggal pakai `Intl` `id-ID`
   lewat `utils/formatters.js`.
6. **Hormati batas 1000 karakter** per field (`services/validator.js`).
7. **Semua collection di `users/{uid}/`** supaya rules yang ada tetap berlaku.
8. Docs di `docs/` (FUNCTIONAL/TECHNICAL SPECIFICATION, USER_GUIDE) **akurat dan
   worth updating**. `README.md` root, `SOP-DEPLOYMENT.md`, dan `README.md` budgetku
   juga sudah diperbarui (29 Sep 2026) dan sekarang sinkron dengan arsitektur
   client-side. Kalau menambah halaman baru, perbarui ketiganya.

### Kalau stuck
Cek urutan: `utils/` (logika murni) → `services/` (I/O + validasi) → `App.jsx` (orkestrasi) → `pages/` (tampilan).
Test unit ada di setiap lapisan `utils/` & `services/` — baca testnya untuk paham kontrak.

### Kalau test gagal
Penting: **sebelum menyentuh kode app, cek apakah testnya yang usang.** Semua 6 failure
yang pernah ada di repo ini adalah masalah test (assertion usang / test yatim), bukan
bug produksi. Kalau sebuah test gagal setelah WIP, bandingkan dulu assertion-nya dengan
kode yang ada sebelum concluding ada bug.
