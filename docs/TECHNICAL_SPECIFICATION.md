# BudgetKu — Technical Specification Document

**Version:** 2.0
**Last Updated:** September 2026
**Status:** Production

---

## 1. Technology Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| UI Framework | React | 19.2.x |
| Build Tool | Vite (dengan Rolldown) | 8.x |
| Styling | Kelas CSS global + CSS Custom Properties | — |
| Charts | Recharts | 2.15.x |
| Icons | lucide-react | 1.17.x |
| Compression | fflate (ZIP untuk CSV export) | 0.8.x |
| Backend / Auth | Firebase (Auth + Firestore + Hosting) | 12.12.x |
| Font | Plus Jakarta Sans (Google Fonts) | — |
| Testing | Vitest + Testing Library + fast-check | 4.x / 16.x / 4.x |
| Linting | ESLint | 9.x |
| Package Manager | npm | — |

### Keputusan Arsitektur Utama

| Keputusan | Alasan |
|-----------|--------|
| Tidak ada backend server | Semua logika berjalan client-side; Firebase menyediakan auth dan storage |
| Tidak ada state management library | State di-lift ke `App.jsx`, diteruskan via props |
| Tidak ada router library | Navigasi berbasis state variable `page` |
| CSS global + design tokens | Primitive bersama di `styles/base.css`, tema dan proporsi di `styles/tokens.css` |
| Vite 8 + Rolldown | Build cepat dengan bundler berbasis Rust |

---

## 2. Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────────┐
│                      Browser (Client)                         │
├──────────────────────────────────────────────────────────────┤
│  React 19 SPA (index.html → main.jsx)                        │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │   Pages     │   │  Components  │   │   App.jsx        │  │
│  │  /pages/**  │←→ │ /components/ │←→ │  (Global State)  │  │
│  └─────────────┘   └──────────────┘   └────────┬─────────┘  │
│                                                 │             │
│  ┌─────────────┐   ┌──────────────┐   ┌────────▼─────────┐  │
│  │    Utils    │   │   Context    │   │  Service Layer   │  │
│  │  /utils/**  │   │  /context/** │   │ firestoreService │  │
│  └─────────────┘   └──────────────┘   └────────┬─────────┘  │
│                                                 │             │
├─────────────────────────────────────────────────┼────────────┤
│                                                 │             │
│         Firebase SDK (firebase/firestore)        │             │
│         Firebase SDK (firebase/auth)             │             │
│                                                 │             │
└─────────────────────────────────────────────────┼────────────┘
                                                  │
              ┌───────────────────────────────────▼────────────┐
              │              Firebase Platform                   │
              │  ┌──────────────┐   ┌─────────────────────┐    │
              │  │  Firebase    │   │  Cloud Firestore     │    │
              │  │  Auth        │   │  (per-user data)     │    │
              │  └──────────────┘   └─────────────────────┘    │
              │  ┌──────────────────────────────────────────┐   │
              │  │  Firebase Hosting (budgetx.web.app)       │   │
              │  └──────────────────────────────────────────┘   │
              └────────────────────────────────────────────────┘
```

---

## 3. Struktur Direktori

```
budgetku/
├── public/                    # Static assets (favicon, logo, icons.svg)
├── src/
│   ├── App.jsx                # Root: semua state, routing, CRUD handlers
│   ├── App.css                # Global styles, CSS custom properties
│   ├── main.jsx               # Entry point: mount React + AuthProvider
│   ├── index.css              # Base CSS reset
│   │
│   ├── config/
│   │   └── firebase.js        # Firebase init (Auth + Firestore, guard jika env kosong)
│   │
│   ├── context/
│   │   ├── AuthContext.jsx    # Firebase Auth state (user, login, register, logout)
│   │   └── ThemeContext.jsx   # Dark/light theme state + CSS var injection
│   │
│   ├── data/
│   │   └── defaults.js        # Data default: WALLETS_INIT, TRANSACTIONS_INIT, BUDGETS_INIT, CATEGORIES
│   │
│   ├── utils/
│   │   ├── constants.js       # WALLET_TYPES, STORAGE_KEY, DARK_VARS, LIGHT_VARS
│   │   ├── formatters.js      # fmtFull, fmt, fmtDate, monthKey
│   │   ├── helpers.js         # getCatById, walletTypeLabel, getPeriodRange, filterByRange, dll.
│   │   ├── debtHelpers.js     # buildDebtTransaction, applyPayment, generateAmortizationSchedule
│   │   ├── investmentHelpers.js # buildInvestmentTransaction, computeTotalUnits, calcDepositoProjectedReturn
│   │   ├── subscriptionHelpers.js # advanceDueDate, buildSubscriptionTransaction
│   │   ├── assetHelpers.js    # Kalkulasi net worth, aset tetap
│   │   ├── fireCalculator.js  # DEFAULT_FIRE_SETTINGS, kalkulasi FIRE/FI Score/proyeksi
│   │   ├── periodAdjuster.js  # Penyesuaian hari kerja (holiday-aware cycle start)
│   │   └── recurring.js       # getAmortizedBySection, formatDuration
│   │
│   ├── services/
│   │   ├── firestoreService.js  # Semua CRUD Firestore (getWallets, createTransaction, dll.)
│   │   ├── validator.js         # Validasi semua entitas sebelum write ke Firestore
│   │   ├── importService.js     # parseAndValidate, computeAppend, parseCsvZip
│   │   ├── exportService.js     # buildBudgetXJson, downloadJson, downloadCsvZip
│   │   ├── debtValidator.js     # validateDebt, validatePayment
│   │   ├── investmentValidator.js # validateInvestment, validateInvestmentTransaction, validateCurrentValue
│   │   └── fixedAssetValidator.js # Validasi aset tetap
│   │
│   ├── components/
│   │   ├── DataMigrator.jsx     # Migrasi localStorage → Firestore saat login pertama
│   │   ├── Sidebar/
│   │   │   └── Sidebar.jsx
│   │   ├── Modal/
│   │   │   └── Modal.jsx
│   │   ├── HelpChat/
│   │   │   └── HelpChat.jsx
│   │   ├── Topbar/
│   │   │   └── Topbar.jsx
│   │   ├── charts/
│   │   │   ├── CompareBarChart.jsx
│   │   │   ├── DailyBarChart.jsx
│   │   │   ├── MonthCompareBar.jsx
│   │   │   └── PieChart.jsx
│   │   ├── icons/
│   │   │   └── NavIcon.jsx      # Semua SVG icon navigasi
│   │   └── ui/
│   │       ├── AmountText.jsx
│   │       ├── CategoryPicker.jsx
│   │       ├── Field.jsx
│   │       ├── Input.jsx
│   │       ├── MultiChip.jsx
│   │       ├── ProgressBar.jsx
│   │       ├── SectionPill.jsx
│   │       ├── Select.jsx
│   │       ├── TxBadge.jsx
│   │       └── WalletIcon.jsx
│   │
│   ├── pages/
│   │   ├── Auth/              # LoginPage, RegisterPage, ForgotPasswordPage
│   │   ├── Dashboard/         # Dashboard, ScoreParts
│   │   ├── Wallet/            # WalletPage, WalletCard, WalletFormModal, TransferModal
│   │   ├── Transactions/      # TransactionsPage, TxFormModal, TxCalendar
│   │   ├── Budget/            # BudgetPage, IncomeModal, PeriodModal, PeriodTransitionModal, SectionEditModal
│   │   ├── Recurring/         # RecurringPage, RecurringFormModal, RepurchaseModal
│   │   ├── Subscription/      # SubscriptionPage, SubscriptionFormModal, PayModal
│   │   ├── Debt/              # DebtPage, DebtFormModal, PaymentModal
│   │   ├── Investment/        # InvestmentPage, InvestmentFormModal, BuyModal, SellModal, UpdateValueModal
│   │   ├── Asset/             # AssetPage, FixedAssetFormModal
│   │   ├── Reports/           # ReportsPage, CycleSettingModal
│   │   ├── Settings/          # SettingsPage, ImportConfirmModal, ResetConfirmModal
│   │   ├── Fire/              # FirePage
│   │   └── Help/              # HelpPage
│   │
│   ├── test/
│   │   ├── setup.js
│   │   └── setup.test.js
│   └── __tests__/             # Unit, property, integration, deployment tests
│
├── dist/                      # Output build (generated, tidak di-commit)
├── scripts/
│   └── build-single-html.mjs  # Inline dist/ jadi satu file HTML mandiri
├── index.html                 # HTML entry point dengan FOUC prevention script
├── vite.config.js             # Konfigurasi Vite + Vitest
├── eslint.config.js           # Konfigurasi ESLint
├── firebase.json              # Konfigurasi Firebase Hosting + Firestore rules
├── firestore.rules            # Firestore security rules
├── .env                       # Variabel env lokal (tidak di-commit)
├── .env.example               # Template variabel env
└── .env.production            # Variabel env production (tidak di-commit)
```

---

## 4. State Management

Tidak ada library state management. Seluruh state global disimpan sebagai `useState` di `App.jsx` dan diteruskan ke child components via props.

### State Variables di App.jsx

| State | Tipe | Deskripsi |
|-------|------|-----------|
| `page` | string | Halaman aktif saat ini |
| `wallets` | array | Daftar dompet pengguna |
| `transactions` | array | Semua transaksi |
| `budgets` | object | Budget per bulan (`{ 'YYYY-MM': {...} }`) |
| `categories` | array | Kategori pengguna |
| `debts` | array | Record utang/piutang |
| `investments` | array | Record investasi |
| `fixedAssets` | array | Aset tetap |
| `subscriptions` | array | Langganan |
| `recurringItems` | array | Item berkala |
| `fireSettings` | object | Konfigurasi FIRE Calculator |
| `darkMode` | boolean | Mode tema |
| `cycleStart` | number | Hari mulai siklus budget (1–28) |
| `salaryAdjust` | boolean | Toggle penyesuaian hari libur |
| `periodMode` | string | `'month'` / `'cycle'` / `'range'` |
| `customRanges` | array | Daftar custom date range periods |
| `dataLoading` | boolean | Loading indicator saat fetch Firestore |
| `dataError` | string | Pesan error global |
| `toast` | string | Pesan toast notification |
| `showMigrator` | boolean | Tampilkan DataMigrator |
| `showAddTx` | boolean | Tampilkan modal tambah transaksi global |

### Pola Update State

Setiap operasi CRUD mengikuti pola:
1. Validasi input client-side
2. Panggil fungsi Firestore (jika authenticated) **atau** update localStorage langsung (local mode)
3. Perbarui state React dengan data hasil operasi
4. Tampilkan toast notifikasi sukses/error

---

## 5. Lapisan Service (firestoreService.js)

### Fungsi yang Diekspor

| Fungsi | Koleksi Firestore | Deskripsi |
|--------|------------------|-----------|
| `getWallets(uid)` | `wallets` | Fetch semua dompet |
| `createWallet(uid, data)` | `wallets` | Tambah dompet baru |
| `updateWallet(uid, id, data)` | `wallets` | Perbarui dompet |
| `deleteWallet(uid, id)` | `wallets` | Hapus dompet |
| `getTransactions(uid)` | `transactions` | Fetch semua transaksi |
| `createTransaction(uid, data)` | `transactions` + `wallets` | Buat transaksi + adjust saldo (atomic batch) |
| `updateTransaction(uid, id, data)` | `transactions` + `wallets` | Perbarui transaksi + revert+apply saldo (atomic) |
| `deleteTransaction(uid, id)` | `transactions` + `wallets` | Hapus transaksi + revert saldo (atomic) |
| `getBudgets(uid)` | `budgets` | Fetch semua budget |
| `updateBudget(uid, monthKey, data)` | `budgets` | Create/update budget bulan |
| `getCategories(uid)` | `categories` | Fetch kategori |
| `createCategory(uid, data)` | `categories` | Tambah kategori |
| `updateCategory(uid, id, data)` | `categories` | Perbarui kategori |
| `deleteCategory(uid, id)` | `categories` | Hapus kategori |
| `getPreferences(uid)` | `preferences/prefs` | Fetch preferensi |
| `updatePreferences(uid, data)` | `preferences/prefs` | Perbarui preferensi |
| `getDebts(uid)` | `debts` | Fetch utang/piutang |
| `createDebt(uid, data)` | `debts` | Tambah record utang/piutang |
| `updateDebt(uid, id, data)` | `debts` | Perbarui record |
| `deleteDebt(uid, id)` | `debts` | Hapus record |
| `getInvestments(uid)` | `investments` | Fetch investasi |
| `createInvestment(uid, data)` | `investments` | Tambah investasi |
| `updateInvestment(uid, id, data)` | `investments` | Perbarui investasi |
| `deleteInvestment(uid, id)` | `investments` | Hapus investasi |
| `getFixedAssets(uid)` | `fixedAssets` | Fetch aset tetap |
| `createFixedAsset(uid, data)` | `fixedAssets` | Tambah aset tetap |
| `updateFixedAsset(uid, id, data)` | `fixedAssets` | Perbarui aset tetap |
| `deleteFixedAsset(uid, id)` | `fixedAssets` | Hapus aset tetap |
| `getSubscriptions(uid)` | `subscriptions` | Fetch langganan |
| `createSubscription(uid, data)` | `subscriptions` | Tambah langganan |
| `updateSubscription(uid, id, data)` | `subscriptions` | Perbarui langganan |
| `deleteSubscription(uid, id)` | `subscriptions` | Hapus langganan |
| `getRecurringItems(uid)` | `recurringItems` | Fetch item berkala |
| `createRecurringItem(uid, data)` | `recurringItems` | Tambah item berkala |
| `updateRecurringItem(uid, id, data)` | `recurringItems` | Perbarui item berkala |
| `deleteRecurringItem(uid, id)` | `recurringItems` | Hapus item berkala |
| `initUser(uid)` | semua koleksi | Inisialisasi data default user baru (batch write) |
| `migrateData(uid, localState)` | semua koleksi | Migrasi localStorage → Firestore (batched, maks 500 ops/batch) |
| `resetUserData(uid)` | semua koleksi | Hapus semua data + re-init default |

### Atomisitas Transaksi Keuangan

Semua operasi yang mempengaruhi saldo dompet menggunakan `writeBatch` Firestore untuk menjamin atomisitas:

```
Income:   createTransaction + wallet.balance += amount
Expense:  createTransaction + wallet.balance -= amount
Transfer: createTransaction + srcWallet.balance -= amount + dstWallet.balance += amount
Update:   updateTransaction + revert old balance effect + apply new balance effect
Delete:   deleteTransaction + revert balance effect
```

---

## 6. Model Data Firestore

### Wallet
```json
{
  "id": "string (auto-generated)",
  "name": "string",
  "type": "bank | ewallet | credit | paylater | cash",
  "balance": "number",
  "color": "string (hex)",
  "note": "string"
}
```

### Transaction
```json
{
  "id": "string (auto-generated)",
  "date": "string (YYYY-MM-DD)",
  "walletId": "string",
  "type": "income | expense | transfer",
  "categoryId": "string | null",
  "amount": "number (positive)",
  "note": "string",
  "tags": ["string"],
  "toWalletId": "string | null (hanya transfer)"
}
```

### Budget
```json
{
  "id": "string (monthKey: YYYY-MM)",
  "totalIncome": "number",
  "needs": { "total": "number", "cats": [{ "id": "string", "amt": "number" }] },
  "wants": { "total": "number", "cats": [{ "id": "string", "amt": "number" }] },
  "savings": { "total": "number", "cats": [{ "id": "string", "amt": "number" }] }
}
```

### Category
```json
{
  "id": "string",
  "name": "string",
  "section": "needs | wants | savings | income",
  "color": "string (hex)"
}
```

### Debt
```json
{
  "id": "string (auto-generated)",
  "type": "utang | piutang",
  "personName": "string",
  "totalAmount": "number",
  "remainingAmount": "number",
  "walletId": "string",
  "dueDate": "string (YYYY-MM-DD) | null",
  "description": "string",
  "status": "active | settled",
  "payments": [{ "amount": "number", "date": "string", "note": "string" }],
  "txIds": ["string"],
  "createdAt": "timestamp"
}
```

### Investment
```json
{
  "id": "string (auto-generated)",
  "name": "string",
  "assetType": "deposito | saham | crypto | emas | reksadana | obligasi | p2p | lainnya",
  "transactions": [
    {
      "type": "buy | sell",
      "date": "string",
      "units": "number",
      "pricePerUnit": "number",
      "totalAmount": "number",
      "walletId": "string",
      "note": "string"
    }
  ],
  "currentValue": "number",
  "lastUpdated": "timestamp | null",
  "notes": "string",
  "tickerSymbol": "string | null",
  "coinName": "string | null",
  "fundName": "string | null",
  "managerName": "string | null",
  "interestRate": "number | null",
  "maturityDate": "string | null",
  "bankName": "string | null",
  "createdAt": "timestamp"
}
```

### FixedAsset
```json
{
  "id": "string (auto-generated)",
  "name": "string",
  "purchaseValue": "number",
  "currentValue": "number",
  "purchaseDate": "string (YYYY-MM-DD)",
  "note": "string"
}
```

### Subscription
```json
{
  "id": "string (auto-generated)",
  "name": "string",
  "amount": "number",
  "billingCycle": "monthly | yearly | weekly",
  "walletId": "string",
  "nextDueDate": "string (YYYY-MM-DD)",
  "categoryId": "string | null",
  "note": "string"
}
```

### Preferences
```json
{
  "darkMode": "boolean",
  "cycleStart": "number (1–28)",
  "salaryAdjust": "boolean",
  "page": "string",
  "periodMode": "month | cycle | range",
  "customRanges": "array",
  "fireSettings": "object"
}
```

---

## 7. Autentikasi

### Firebase Auth Flow

```
User → LoginPage → firebase.auth().signInWithEmailAndPassword()
                 → onAuthStateChanged → AuthContext.user set
                 → App.jsx load data dari Firestore
                 → Cek localStorage (migrasi jika ada data)

User → RegisterPage → firebase.auth().createUserWithEmailAndPassword()
                    → initUser(uid) — buat kategori + preferensi default
                    → onAuthStateChanged → AuthContext.user set
```

### Local-Only Mode

Jika variabel environment Firebase tidak di-set (`VITE_FIREBASE_API_KEY` kosong), `config/firebase.js` mengembalikan `auth = null` dan `db = null`. App.jsx mendeteksi kondisi ini via `IS_LOCAL_MODE = !firebaseAuth` dan menggunakan localStorage sebagai satu-satunya persistensi.

---

## 8. Firebase Hosting & Deployment

### Konfigurasi firebase.json

```json
{
  "hosting": [
    {
      "site": "budgetku-app-v1",
      "public": "dist",
      "redirects": [{ "source": "**", "destination": "https://budgetx.web.app", "type": 301 }]
    },
    {
      "target": "budgetx",
      "public": "dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }],
      "headers": [{ "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }]
    }
  ],
  "firestore": { "rules": "firestore.rules" }
}
```

- **Primary URL:** https://budgetx.web.app
- **Legacy URL:** https://budgetku-app-v1.web.app (redirect 301 ke primary)
- **SPA Rewrite:** Semua path mengarah ke `/index.html`
- **Asset Caching:** `/assets/**` di-cache immutable 1 tahun (Vite content-hash filenames)

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;   // default deny all
    }
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Perintah Deploy

```bash
# Build production
npm run build

# Deploy hosting + Firestore rules
firebase deploy --only hosting:budgetx,firestore:rules

# Deploy hosting saja
firebase deploy --only hosting:budgetx
```

---

## 9. Environment Variables

| Variable | Required | Deskripsi |
|----------|----------|-----------|
| `VITE_FIREBASE_API_KEY` | Optional* | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Optional* | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Optional* | Firebase Project ID |

*Jika tidak di-set, aplikasi berjalan dalam local-only mode (localStorage saja).

File template tersedia di `.env.example`. Nilai production di `.env.production` (tidak di-commit ke git).

---

## 10. Build & Bundling

### Perintah

```bash
npm run dev         # Jalankan dev server (Vite HMR)
npm run build       # Build production ke dist/
npm run build:single # Build + gabung jadi ../budgetx.html (satu file mandiri)
npm run preview     # Preview build production secara lokal
npm run lint        # Jalankan ESLint
npm run test        # Jalankan semua test (single run)
npm run test:watch  # Jalankan test dalam watch mode
```

### Output Build

Vite menghasilkan file ke `dist/`:
- `index.html` — Entry HTML
- `assets/*.js` — Bundle JavaScript dengan content hash
- `assets/*.css` — Bundle CSS dengan content hash
- File publik dari `public/` (favicon, logo, icons)

### Single-File Build

`scripts/build-single-html.mjs` menggabungkan `dist/` menjadi satu file HTML
mandiri (`../budgetx.html`, ±1.4 MB) yang bisa dibuka langsung dari filesystem —
tanpa server dan tanpa file tetangga.

| Yang di-inline | Cara |
|----------------|------|
| `assets/*.js` | Satu `<script type="module">` di `<head>` |
| `assets/*.css` | Satu `<style>` |
| `public/logo.png` | Data URI untuk favicon |

Yang **tidak** di-inline: Google Fonts (tetap `<link>`; ±250 KB woff2 untuk
ke-Nordifan yang sepele — offline app jatuh ke system font).

Tiga jebakan yang dijaga script dan oleh
`src/__tests__/deployment/single-html-build.test.js`:

1. **`$` di `String.replace`.** Bundle minified penuh `` $` ``, `$&`, `$'`.
   Kalau bundle dipakai sebagai *string* replacement, pola itu ekspansi jadi HTML
   sekeliling dan output-nya korup. Semua `replace` di script ini memakai
   function replacer (`() => value`), yang mematikan interpretasi `$`.
2. **`</script` di dalam bundle.** Mengakhiri elemen script lebih awal; sisa
   kode diparse sebagai HTML. Semua `</script` di-escape jadi `<\/script`.
3. **`/logo.png` dari 5 komponen.** Path-nya relatif ke root server, jadi 404
   begitu file berdiri sendiri. Call site-nya ditulis ulang jadi identifier
   global `__BUDGETX_LOGO__` yang diisi data URI once di `<head>` — bukan
   meng-inline 55 KB base64 di tiap call site.

Mode auth mengikuti apa yang di-build: `VITE_FIREBASE_*` terisi → cloud mode
(butuh internet + login, menulis ke project Firebase produksi). Kosong → local
mode (`localStorage` saja, benar-benar offline).

---

## 11. Testing

### Framework

| Tool | Kegunaan |
|------|----------|
| Vitest | Test runner (kompatibel Vite) |
| @testing-library/react | Render dan interaksi komponen |
| @testing-library/jest-dom | Custom matchers DOM |
| jsdom | Simulasi DOM browser |
| fast-check | Property-based testing |

### Struktur Test

```
src/__tests__/
├── components/
│   ├── Sidebar.test.jsx
│   └── ui.test.jsx
├── context/
│   └── ThemeContext.test.jsx
├── deployment/
│   └── firebase-config.test.js     # Verifikasi konfigurasi firebase.json/.firebaserc
├── logic/
│   ├── budget.property.test.js
│   ├── persistence.property.test.js
│   ├── persistence.test.js
│   ├── transactions.property.test.js
│   └── wallet.property.test.js
├── services/
│   ├── firestoreService.test.js
│   ├── importService.test.js
│   └── validator.test.js
└── utils/
    ├── formatters.property.test.js
    ├── formatters.test.js
    ├── helpers.property.test.js
    └── helpers.test.js
```

### Property-Based Tests (fast-check)

12 properti universal yang diverifikasi:

| # | Properti | File |
|---|----------|------|
| 1 | Wallet balance aggregation | wallet.property.test.js |
| 2 | Transfer conserves total balance | wallet.property.test.js |
| 3 | Transaction filtering correctness | transactions.property.test.js |
| 4 | Transaction grouping by date | transactions.property.test.js |
| 5 | Budget allocation invariants | budget.property.test.js |
| 6 | Daily budget calculation | budget.property.test.js |
| 7 | Recent transactions selection | transactions.property.test.js |
| 8 | Period range filtering | helpers.property.test.js |
| 9 | Billing cycle period range computation | helpers.property.test.js |
| 10 | State serialization round trip | persistence.property.test.js |
| 11 | Currency/abbreviated formatting | formatters.property.test.js |
| 12 | Category filtering by transaction type | helpers.property.test.js |

---

## 12. Responsivitas & Mobile

### Breakpoint

| Breakpoint | Nilai | Perilaku |
|------------|-------|----------|
| Mobile | ≤ 768px | Bottom navigation bar, single-column layout |
| Desktop | > 768px | Sidebar kiri, multi-column layout |

### Perubahan Layout di Mobile

- Sidebar disembunyikan (`display: none`)
- Bottom Navigation Bar muncul (fixed, min 56px, semua 6 item navigasi utama)
- Grid 4-kolom stat cards → 2 kolom
- Grid dashboard (main + sidebar) → single column
- Grid wallet cards, budget categories → single column
- Modal menjadi bottom sheet, lebar viewport, tinggi maksimum 92vh
- Heading halaman 34px → 28px
- Toolbar/form/aksi kartu pada desktop standar: 36px/40px/32px
- Touch target minimum 44×44px

### Implementasi

Responsivitas menggunakan media queries di kelas global `src/styles/base.css`.
Token proporsi, tema, kerapatan dan radius berada di `src/styles/tokens.css`.
Seluruh CSS Module sudah dimigrasikan; modifier halaman diberi prefix untuk
menjaga primitive bersama dari benturan selector.

---

## 13. Format Data: Import/Export

### Format JSON (BudgetKu Format)

```json
{
  "version": "1.0",
  "exportedAt": "ISO 8601 timestamp",
  "wallets": [...],
  "transactions": [...],
  "budgets": { "YYYY-MM": {...} },
  "categories": [...],
  "preferences": {...}
}
```

### Format CSV (ZIP Bundle)

ZIP berisi:
- `wallets.csv`
- `transactions.csv`
- `budgets.csv` (flattened: monthKey, section, categoryId, amount)
- `categories.csv`

Encoding: UTF-8 dengan BOM untuk kompatibilitas Excel Indonesia.
Compression: fflate (pure JS, no native deps).

---

## 14. Keamanan

| Aspek | Implementasi |
|-------|-------------|
| Isolasi data pengguna | Firestore rules: `request.auth.uid == userId` |
| Autentikasi | Firebase Auth — token dikelola oleh SDK |
| Validasi input | `services/validator.js` — validasi sebelum write ke Firestore |
| Ukuran file impor | Maksimum 10 MB — ditolak sebelum parsing |
| String input | Maksimum 1000 karakter per field |
| Data sensitif | API keys disimpan di environment variables, tidak di-hardcode |
| Operasi destruktif | Reset data dilindungi konfirmasi + safety input "Delete" |

---

## 15. Riwayat Versi

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | Jul 2025 | Arsitektur awal: React + Vite, localStorage, 5 halaman |
| 1.1 | Jul 2025 | Integrasi Firebase Auth + Firestore, Express backend |
| 1.2 | Aug 2025 | Migrasi ke client-side Firestore SDK (hapus Express backend) |
| 1.3 | Aug 2025 | Tambah fitur: Debt, Investment, FIRE, Recurring, Subscription, Asset |
| 1.4 | Aug 2025 | Tambah: Import/Export, Reset, Custom period, Salary adjustment |
| 2.0 | Sep 2026 | Konsolidasi dokumentasi; hapus prototype HTML; cleanup dead code |
