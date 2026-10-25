# BudgetX — Personal Finance Manager

**Aplikasi pengelola keuangan pribadi berbahasa Indonesia yang lengkap dan gratis.**

🌐 **Live:** [https://budgetx.web.app](https://budgetx.web.app)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 💰 **Dompet** | Kelola banyak rekening (Bank, E-Wallet, Kredit, PayLater, Tunai) |
| 📊 **Transaksi** | Catat pemasukan, pengeluaran, transfer dengan emoji kategori |
| ✅ **Konfirmasi receipt** | Antrean review email-mesh, persetujuan per revisi tanpa pencatatan ganda; aktivasi bridge/rules terpisah |
| 📋 **Budget** | Alokasi anggaran 50/30/20 dengan 3 mode periode |
| 📝 **Wishlist** | Kelompok rencana pembelian, target anggaran/tanggal, estimasi harga, catatan, dan prioritas; tanpa mengubah saldo/transaksi |
| 📦 **Barang Berkala** | Track item periodik (skincare, shampo, dll) + biaya amortisasi |
| 💳 **Utang/Piutang** | Cicilan dengan bunga anuitas + tabel amortisasi |
| 📈 **Investasi** | Portfolio tracking (Deposito, Saham, Crypto, Emas, Reksadana, dll) |
| 🏠 **Aset Tetap** | Catat properti, kendaraan, elektronik + gain/loss |
| 🛡️ **Kesehatan Keuangan** | Health Score, Net Worth, 5 rasio + rekomendasi |
| 🔥 **FIRE Calculator** | Simulasi pensiun dini dengan 3 skenario proyeksi |
| 📉 **Laporan** | Pie chart, daily chart, budget performance, comparison |
| 🤖 **Help Chat** | Bot FAQ + User Guide lengkap |

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite 8
- **Styling:** Kelas CSS global + design tokens (tema, kerapatan, radius)
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **Charts:** Recharts
- **Font:** IBM Plex Sans/Mono self-hosted, dengan fallback sistem

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/ekadinataa/BudgetX.git
cd BudgetX

# Install
npm install

# Run (local-only mode — no Firebase needed)
VITE_FIREBASE_API_KEY='' VITE_FIREBASE_AUTH_DOMAIN='' VITE_FIREBASE_PROJECT_ID='' npm run dev
```

Buka http://localhost:5173 — app berjalan full tanpa akun (data di localStorage).

### Data demo siap impor

[Unduh demo Agustus–Oktober 2026](https://budgetx.web.app/demo/budgetx-demo-agustus-oktober-2026.json)
untuk mencoba semua menu, termasuk contoh kelompok Wishlist. Pada akun khusus demo, buka **Pengaturan → Impor Cadangan → Pilih File**,
lalu pilih **Ganti Semua (Replace)**. Panduan dan rincian dataset ada di [Data Demo](docs/DEMO_DATA.md).

### Dengan Firebase

```bash
# Copy env file
cp .env.example .env

# Edit .env dengan Firebase credentials
# VITE_FIREBASE_API_KEY=...
# VITE_FIREBASE_AUTH_DOMAIN=...
# VITE_FIREBASE_PROJECT_ID=...

npm run dev
```

---

## 📄 Single File

Build produksi bisa digabung jadi **satu file HTML mandiri** — CSS, JS, logo, dan font
sudah inline, jadi bisa dibuka langsung dari filesystem tanpa server:

```bash
npm run build:single   # → ../budgetx.html (±1.4 MB)
```

IBM Plex Sans/Mono di-host sendiri dan ikut di-inline. Mode auth mengikuti
environment saat build (termasuk `.env.production`): env terisi → cloud mode
(butuh internet + login); override `VITE_FIREBASE_API_KEY=''` → local mode.

---

## 📦 Deployment

```bash
# Build
npm run build

# Deploy ke Firebase Hosting
firebase deploy --only hosting:budgetx
```

---

## 📚 Dokumentasi

| Dokumen | Deskripsi |
|---------|-----------|
| [Functional Specification](docs/FUNCTIONAL_SPECIFICATION.md) | Spesifikasi fungsional lengkap |
| [Technical Specification](docs/TECHNICAL_SPECIFICATION.md) | Arsitektur teknis, data model, algoritma |
| [User Guide](docs/USER_GUIDE.md) | Panduan pengguna (Bahasa Indonesia) |
| [AGENTS.md](AGENTS.md) | Konteks untuk AI agent: arsitektur, aturan, temuan teknis |
| [Migrasi UI video](docs/VIDEO_UI_MIGRATION.md) | Acuan visual baru, pemetaan komponen, QA lokal, dan batas rilis |
| [Rilis production 25 Oktober 2026](docs/PRODUCTION_RELEASE_2026-10-25.md) | Redesign + Wishlist, verifikasi live dan versi rollback |

---

## 🏗️ Project Structure

```
budgetku/
├── src/
│   ├── App.jsx              # State owner, routing
│   ├── components/          # Reusable UI (Sidebar, charts, HelpChat)
│   ├── pages/               # Feature pages (Dashboard, Wallet, Tx, Budget, ...)
│   ├── services/            # Firestore CRUD, validators, import/export
│   ├── utils/               # Pure helpers (formatters, calculators)
│   ├── context/             # Auth + Theme providers
│   └── data/                # Default data
├── docs/                    # Documentation
├── public/                  # Static assets
├── scripts/                 # Build scripts (single-file HTML)
└── firebase.json            # Hosting config
```

---

## 🌙 Dark/Light Theme

BudgetX mendukung dark/light mode, tiga kerapatan, dan tiga radius. Tema dapat
diganti dari utility rail (desktop) atau menu navigasi (mobile).

---

## 📱 Responsive Design

- **Desktop:** Navigasi kapsul berkelompok dan floating utility rail.
- **Mobile:** Menu semua halaman, bottom navigation, dan tombol catat transaksi.
- Redesign dan integrasi Wishlist dirilis ke Hosting production pada 25 Oktober 2026.

Wishlist tersedia di **Perencanaan → Wishlist** pada desktop dan menu
**Semua halaman → Wishlist** pada mobile; pintasan **Pengaturan → Wishlist** tetap tersedia.
Target Wishlist adalah batas biaya rencana, bukan tabungan atau alokasi Budget.
Cadangan JSON dan `backup.json` dalam ZIP menyertakan kelompok beserta item;
Replace mengganti seluruh Wishlist, Append melewati ID kelompok yang sudah ada.
Cadangan lama tanpa Wishlist dipulihkan sebagai daftar kosong.

---

## 🔒 Security

- Firebase Authentication (email/password)
- Per-user data isolation (Firestore security rules)
- HTTPS enforced
- No sensitive data in client bundle

---

## 📄 License

MIT

---

**Made with ❤️ for Indonesian personal finance community**
