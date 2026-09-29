# BudgetX — Personal Finance Manager

**Aplikasi pengelola keuangan pribadi berbahasa Indonesia yang lengkap dan gratis.**

🌐 **Live:** [https://budgetx.web.app](https://budgetx.web.app)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 💰 **Dompet** | Kelola banyak rekening (Bank, E-Wallet, Kredit, PayLater, Tunai) |
| 📊 **Transaksi** | Catat pemasukan, pengeluaran, transfer dengan emoji kategori |
| 📋 **Budget** | Alokasi anggaran 50/30/20 dengan 3 mode periode |
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
- **Styling:** CSS Modules + CSS Custom Properties (Dark/Light theme)
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **Charts:** Recharts
- **Font:** Plus Jakarta Sans

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/ekadinataa/budgetku.git
cd budgetku

# Install
npm install

# Run (local-only mode — no Firebase needed)
npm run dev
```

Buka http://localhost:5173 — app berjalan full tanpa akun (data di localStorage).

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
└── firebase.json            # Hosting config
```

---

## 🌙 Dark/Light Theme

BudgetX mendukung dark mode dan light mode dengan transisi yang smooth. Toggle dari sidebar (desktop) atau menu avatar (mobile).

---

## 📱 Responsive Design

- **Desktop:** Sidebar navigation
- **Mobile:** Bottom nav + FAB (+) + Hero card + Quick menu

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
