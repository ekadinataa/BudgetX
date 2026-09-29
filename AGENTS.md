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

### Status git saat ini (29 Sep 2026)
Commit terakhir: `776ff97 docs: update README.md for BudgetX`.
Working tree **bersih** untuk yang kritical, tapi masih ada banyak WIP belum di-commit
(`src/pages/Subscription/`, `src/utils/subscriptionHelpers.js`, `public/logo.png` untracked).

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
| CSS Modules | Scoped per komponen. Warna hex masih di-hardcode di JSX (masalah konsistensi yang tersisa). |

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

## 3. Komponen Inti

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

## 4. Command

```bash
npm run dev         # Vite dev server :5173
npm run build       # → dist/  (butuh @rolldown/binding-<platform>!)
npm test            # vitest --run  (17 file, 316 test)
npm run lint        # ESLint flat config
npm run preview     # serve build
```

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

## 5. Test Suite

17 file, **316 test — semua hijau** (per 29 Sep 2026). `setup.js` hanya berisi
`import '@testing-library/jest-dom'`.

| Kategori | File | Catatan |
|---|---|---|
| Property-based (fast-check) | 6 file, `numRuns: 100` | helpers, formatters, wallet, transactions, budget, persistence |
| Unit | validator (104), firestoreService (51), helpers (41) | |
| Komponen | ui (23), Sidebar (10), ThemeContext (8) | |
| Deployment | firebase-config (9) | Baca `firebase.json`/`.firebaserc`/`firestore.rules` dari disk |

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

## 6. Status Saat Ini (hasil verifikasi 29 Sep 2026, setelah perbaikan)

| Cek | Hasil |
|---|---|
| `npm run build` | ✅ sukses |
| `npm test` | ✅ **316/316 pass**, 17/17 file |
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

### 🟠 Gap yang ditemukan saat cleanup (belum diperbaiki)
`validateInvestment(data, hasTransactions)` punya param `hasTransactions` yang tidak
pernah dipakai. Param itu dihapus, tapi gap aslinya dicatat di JSDoc: **assetType
hanya terlindungi di UI** (`InvestmentFormModal` men-disable select saat sudah ada
transaksi). `App.jsx` `handleUpdateInvestment` tidak memvalidasi sama sekali, jadi
update di luar form itu tidak punya guard. Perbaikannya butuh parameter tambahan
(original assetType) — di luar scope lint cleanup.

---

## 7. Menjalankan App Lokal & UAT

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

## 8. Temuan Teknis Penting (untuk Hindari Pengulangan)

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

## 9. Aturan Kerja Sama

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
