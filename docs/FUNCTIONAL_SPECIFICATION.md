# BudgetKu — Functional Specification Document

**Version:** 2.0
**Last Updated:** September 2026
**Status:** Production

---

## 1. Ringkasan Eksekutif

BudgetKu adalah aplikasi web manajemen keuangan pribadi yang dirancang khusus untuk pengguna Indonesia. Aplikasi ini menyediakan alat untuk pelacakan pengeluaran, perencanaan anggaran, manajemen utang/piutang, pelacakan portofolio investasi, manajemen aset tetap, dan perencanaan keuangan jangka panjang (FIRE — Financial Independence, Retire Early).

### Target Pengguna

- Profesional muda Indonesia (milenial dan Gen-Z) yang mengelola keuangan pribadi
- Pengguna yang menginginkan alat budgeting lengkap dalam bahasa Indonesia
- Individu yang merencanakan kemandirian finansial jangka panjang

### Masalah yang Diselesaikan

- Pelacakan keuangan yang tersebar di banyak aplikasi dan spreadsheet
- Kurangnya alat keuangan pribadi berbahasa Indonesia yang komprehensif
- Tidak adanya tampilan terpadu untuk anggaran, utang, investasi, dan pengeluaran berulang
- Kesulitan merencanakan tujuan keuangan jangka panjang (FIRE)

---

## 2. Gambaran Produk

| Atribut | Detail |
|---------|--------|
| Nama Produk | BudgetKu — Money Tracker |
| Platform | Web application (responsif — desktop + mobile) |
| URL Deployment | https://budgetku-app-v1.web.app |
| Bahasa | Bahasa Indonesia |
| Mode Auth | Firebase Authentication (email/password) atau local-only (tanpa akun) |
| Mata Uang | Rupiah Indonesia (IDR) |

BudgetKu berjalan sebagai Single Page Application client-side dengan persistensi cloud opsional. Pengguna dapat menggunakan aplikasi tanpa membuat akun (data disimpan di localStorage) atau mengautentikasi untuk sinkronisasi data antar perangkat via Firebase Firestore.

---

## 3. Peran Pengguna

### 3.1 Pengguna Terautentikasi
- Akses penuh ke semua fitur
- Data disimpan ke Firebase Firestore (sinkronisasi cloud)
- Kemampuan login, register, dan reset password
- Migrasi data dari localStorage ke cloud saat autentikasi pertama

### 3.2 Pengguna Local-Only
- Akses penuh ke semua fitur (fungsionalitas identik)
- Data disimpan di localStorage browser saja
- Tidak perlu membuat akun

---

## 4. Modul Fitur

### 4.1 Autentikasi

**Deskripsi:** Sistem autentikasi berbasis Firebase Authentication dengan email/password.

**Fungsionalitas:**
- **Register:** Buat akun baru dengan email dan password (min. 8 karakter)
- **Login:** Masuk dengan kredensial terdaftar
- **Lupa Password:** Kirim email reset password ke alamat terdaftar
- **Logout:** Keluar dari sesi aktif
- **Migrasi Data:** Saat login pertama kali, tawarkan migrasi data localStorage ke Firestore

**Alur Navigasi Auth:**
```
Tidak terautentikasi → Login Page
                     ↔ Register Page
                     ↔ Lupa Password Page
Terautentikasi → Dashboard
```

**Validasi:**
- Email: format valid (RFC 5322)
- Password: minimum 8 karakter
- Konfirmasi password: harus cocok dengan password

---

### 4.2 Dashboard

**Deskripsi:** Halaman ringkasan yang menampilkan snapshot keuangan terkini pengguna.

**Komponen:**

| Komponen | Deskripsi |
|----------|-----------|
| Stat Cards | Budget Hari Ini, Pemasukan Bulan Ini, Pengeluaran Bulan Ini, Total Saldo |
| Ringkasan Budget | Progress bar per seksi (Kebutuhan/Keinginan/Tabungan) dengan indikator overflow |
| Kalender Interaktif | Kalender bulan dengan titik warna untuk hari bertransaksi; klik hari untuk lihat detail |
| Ringkasan Dompet | Hingga 4 dompet teratas dengan saldo |
| Transaksi Terbaru | 6 transaksi non-transfer terbaru |
| Widget Utang/Piutang | Utang/piutang jatuh tempo dalam 7 hari dan yang sudah lewat jatuh tempo |
| Widget Investasi | Total nilai portofolio, unrealized gain/loss, return percentage |
| Tombol Tambah Transaksi | Akses cepat ke modal tambah transaksi dari mana saja |

**Kalkulasi Budget Hari Ini:**
```
Budget Harian = Pendapatan Bulanan ÷ Jumlah Hari dalam Bulan
Sisa Hari Ini = Budget Harian − Total Pengeluaran Hari Ini
```

---

### 4.3 Dompet (Wallet)

**Deskripsi:** Manajemen akun keuangan pengguna lintas tipe.

**Tipe Dompet yang Didukung:**
- Bank
- E-Wallet
- Kartu Kredit
- PayLater
- Tunai/Cash

**Fungsionalitas:**

| Aksi | Deskripsi |
|------|-----------|
| Tambah Dompet | Form dengan nama, tipe, saldo awal, warna, dan catatan opsional |
| Edit Dompet | Ubah nama, tipe, saldo, warna, dan catatan |
| Hapus Dompet | Konfirmasi sebelum penghapusan |
| Transfer | Pindahkan saldo antar dompet; otomatis buat transaksi transfer |
| Ringkasan | Total Saldo Bersih, Total Aset (saldo positif), Total Hutang (saldo negatif) |

**Tampilan Kartu Dompet:** Nama, tipe, saldo, pemasukan/pengeluaran bulan ini dengan warna header sesuai pilihan pengguna.

---

### 4.4 Transaksi

**Deskripsi:** Pencatatan, tampilan, filter, edit, dan hapus transaksi keuangan.

**Tipe Transaksi:**
- **Pemasukan** — Menambah saldo dompet
- **Pengeluaran** — Mengurangi saldo dompet
- **Transfer** — Pindah saldo antar dompet (tidak mempengaruhi total saldo)

**Filter yang Tersedia:**
- Cari berdasarkan catatan (teks bebas)
- Periode (bulan/range kustom)
- Dompet
- Tipe transaksi
- Kategori
- Tag

**Tampilan List:** Dikelompokkan per tanggal, dengan header tanggal menampilkan total pemasukan dan pengeluaran hari tersebut.

**Summary Bar:** Total pemasukan, total pengeluaran, dan net cashflow untuk filter aktif.

**Validasi Transaksi:**
- Tanggal: wajib, format YYYY-MM-DD
- Dompet: wajib dipilih
- Tipe: income/expense/transfer
- Kategori: wajib untuk income/expense; tidak berlaku untuk transfer
- Nominal: angka positif
- Transfer: wajib pilih dompet tujuan yang berbeda dari sumber

---

### 4.5 Budget

**Deskripsi:** Perencanaan anggaran bulanan berbasis aturan 50/30/20.

**Seksi Budget:**
| Seksi | Label | Pedoman |
|-------|-------|---------|
| needs | Kebutuhan | 50% |
| wants | Keinginan | 30% |
| savings | Tabungan | 20% |

**Mode Periode:**

| Mode | Deskripsi |
|------|-----------|
| Per Bulan | Periode kalender bulanan standar (YYYY-MM) |
| Custom Siklus | Siklus mulai dari hari tertentu (misal: gajian tanggal 25); mendukung penyesuaian hari libur nasional Indonesia |
| Custom Rentang | Tentukan tanggal mulai dan akhir sendiri; transisi antar periode dengan opsi salin alokasi sebelumnya |

**Penyesuaian Hari Libur (Custom Siklus):**
Jika tanggal gajian jatuh pada hari Sabtu, Minggu, atau hari libur nasional Indonesia, sistem menggeser tanggal mulai mundur ke hari kerja sebelumnya (maksimal 7 hari ke belakang).

**Fungsionalitas:**
- Atur total pendapatan per periode
- Alokasikan anggaran per seksi dan per kategori
- Visualisasi distribusi aktual vs pedoman 50/30/20
- Indikator overflow jika pengeluaran melebihi alokasi
- Buat dan kelola kategori kustom per seksi

**Kalkulasi:**
```
Total Dialokasikan = Σ Alokasi semua seksi
Belum Dialokasikan = Total Pendapatan − Total Dialokasikan
Total Terpakai = Σ Pengeluaran sesuai kategori dalam periode aktif
```

---

### 4.6 Berkala (Recurring)

**Deskripsi:** Pelacakan pengeluaran atau pemasukan yang berulang secara berkala.

**Fungsionalitas:**
- Catat item berkala (nama, nominal, frekuensi, dompet, kategori)
- Lihat ringkasan total kewajiban berkala per bulan
- Repurchase: tandai item sebagai sudah dibayar dan catat transaksi baru secara otomatis
- Tampilan durasi dan frekuensi item

---

### 4.7 Langganan (Subscription)

**Deskripsi:** Manajemen biaya berlangganan layanan digital dan lainnya.

**Fungsionalitas:**
- Tambah, edit, hapus langganan
- Setiap langganan memiliki: nama, nominal, siklus tagihan, dompet, tanggal jatuh tempo berikutnya
- Bayar langganan: otomatis buat transaksi pengeluaran dan perbarui tanggal jatuh tempo berikutnya
- Identifikasi langganan yang segera jatuh tempo

---

### 4.8 Utang/Piutang (Debt)

**Deskripsi:** Pencatatan dan pelacakan utang (uang yang dipinjam) dan piutang (uang yang dipinjamkan).

**Tipe Record:**
- **Utang** — Uang yang dipinjam pengguna dari pihak lain
- **Piutang** — Uang yang dipinjamkan pengguna ke pihak lain

**Fungsionalitas:**

| Aksi | Efek Otomatis |
|------|---------------|
| Buat utang baru | Transaksi pemasukan di dompet terkait (menerima pinjaman) |
| Buat piutang baru | Transaksi pengeluaran di dompet terkait (memberikan pinjaman) |
| Catat pembayaran utang | Transaksi pengeluaran di dompet terkait (membayar) |
| Catat pembayaran piutang | Transaksi pemasukan di dompet terkait (menerima pengembalian) |

**Kalkulasi:**
```
Net Position = Total Piutang Aktif − Total Utang Aktif
```

**Status Record:** active → settled (otomatis saat remainingAmount = 0)

**Filter:** Tipe (utang/piutang), status (active/settled)

**Dashboard Integration:** Widget menampilkan record jatuh tempo dalam 7 hari dan yang sudah melewati jatuh tempo.

---

### 4.9 Investasi (Investment)

**Deskripsi:** Pencatatan dan pelacakan portofolio investasi di berbagai jenis aset.

**Tipe Aset yang Didukung:**
deposito, saham, crypto, emas, reksadana, obligasi, p2p, lainnya

**Fungsionalitas:**

| Aksi | Efek Otomatis |
|------|---------------|
| Beli (buy) | Transaksi pengeluaran di dompet terkait + tag "investasi" |
| Jual (sell) | Transaksi pemasukan di dompet terkait + tag "investasi" |
| Update nilai terkini | Perbarui currentValue (tidak membuat transaksi) |

**Kalkulasi Portfolio:**
```
Cost Basis = Σ Pembelian − Σ Biaya beli yang dijual
Unrealized Gain = Current Value − Cost Basis
Return % = (Unrealized Gain / Cost Basis) × 100
Average Buy Price = Total Biaya Tersisa / Total Unit Tersisa
```

**Fitur Khusus Deposito:**
- Simpan bunga, tenor, dan tanggal jatuh tempo
- Hitung proyeksi return: `Pokok × (Bunga% / 100) × (Hari / 365)`
- Auto-update currentValue berdasarkan bunga yang sudah berjalan
- Badge "Jatuh Tempo" jika maturityDate sudah terlewat

**Dashboard Integration:** Widget menampilkan total nilai portofolio, unrealized gain/loss, dan return %.

---

### 4.10 Aset (Asset / Net Worth)

**Deskripsi:** Tampilan kekayaan bersih (net worth) yang menggabungkan semua aset dan kewajiban, termasuk aset tetap.

**Komponen Net Worth:**
```
Net Worth = Total Saldo Dompet − Total Utang Aktif + Total Piutang Aktif
          + Total Nilai Investasi + Total Nilai Aset Tetap − Total Utang Aset Tetap
```

**Aset Tetap (Fixed Assets):**
- Catat aset fisik (properti, kendaraan, dll.)
- Field: nama, nilai pembelian, nilai terkini, tanggal pembelian, catatan
- Tambah, edit, hapus aset tetap

---

### 4.11 Laporan (Reports)

**Deskripsi:** Laporan dan visualisasi keuangan berdasarkan periode aktif.

**Komponen Laporan:**

| Komponen | Deskripsi |
|----------|-----------|
| Cashflow Summary | Total pemasukan, total pengeluaran (+ % perubahan vs bulan lalu), net cashflow |
| Pie Chart Pengeluaran | Breakdown pengeluaran per kategori dengan legenda |
| Bar Chart Perbandingan | Perbandingan pemasukan/pengeluaran bulan ini vs bulan lalu |
| Bar Chart Harian | Pengeluaran per hari dalam periode; warna berbeda untuk hari ini, tinggi, sedang, rendah |
| Performa Budget | Spent vs allocated per seksi dan per kategori dengan progress bar |

---

### 4.12 FIRE Calculator

**Deskripsi:** Kalkulator dan simulator perjalanan menuju kemandirian finansial (Financial Independence, Retire Early).

**Input Data Finansial:**
- Usia saat ini
- Target usia pensiun
- Pendapatan bulanan (bisa auto-fill dari rata-rata 3 bulan terakhir)
- Pengeluaran bulanan (bisa auto-fill dari rata-rata 3 bulan terakhir)
- Aset FIRE saat ini (bisa auto-fill dari total nilai investasi)

**Konfigurasi Alokasi Pendapatan:**
- Pokok (essentials), Hiburan, FIRE/Investasi, Emas — total harus 100%

**Asumsi Pasar (slider):**
- Return investasi pra-pensiun: 1%–20% (default 10%)
- Kenaikan gaji tahunan: 0%–15% (default 5%)
- Estimasi inflasi: 1%–12% (default 4%)
- Return konservatif pasca-pensiun: 1%–12% (default 6%)

**Kalkulasi:**
```
FIRE Number = Pengeluaran Bulanan × 12 × 25
FIRE Number (inflation-adjusted) = FIRE Number × (1 + inflasi)^tahun_tersisa
FI Readiness Score = (Aset FIRE Saat Ini / FIRE Number Adjusted) × 100%
```

**Proyeksi Pertumbuhan Portfolio:**
Tiga skenario (Optimis +2%, Moderat, Pesimis −2%) ditampilkan sebagai line chart dari usia saat ini hingga target pensiun.

**Tab Hasil:**
1. **Saran** — Rekomendasi personal berdasarkan savings rate dan FI Readiness Score
2. **Akumulasi** — Tabel breakdown tahunan (tabungan, nilai portfolio, pertumbuhan kumulatif)
3. **Pensiun** — Simulasi drawdown: berapa tahun portfolio bertahan di fase pensiun

**Persistensi:** FIRE settings disimpan otomatis ke Firestore/localStorage setelah 500ms debounce.

---

### 4.13 Pengaturan (Settings)

**Deskripsi:** Halaman manajemen akun, data, dan preferensi aplikasi.

**Fitur:**

| Fitur | Deskripsi |
|-------|-----------|
| Manajemen Kategori | Tambah, edit, hapus kategori kustom per seksi |
| Ekspor Data (JSON) | Export semua data ke file JSON berformat `budgetku-export-YYYY-MM-DD.json` |
| Ekspor Data (CSV) | Export semua data ke ZIP berisi file CSV per koleksi |
| Impor Data | Import dari file JSON BudgetKu; pilih mode Replace atau Append |
| Reset Data | Hapus semua data dan mulai dari awal; dilindungi safety input "Delete" |

**Mode Impor:**
- **Replace:** Hapus semua data existing, ganti dengan data dari file
- **Append:** Tambahkan data dari file; skip item dengan ID yang sudah ada

---

### 4.14 Bantuan (Help)

**Deskripsi:** Halaman FAQ dan panduan penggunaan aplikasi.

---

## 5. Navigasi & Routing

Aplikasi menggunakan state-based navigation (tanpa React Router). Halaman ditentukan oleh nilai variabel `page`:

| Nilai `page` | Halaman | Ikon Sidebar |
|---|---|---|
| `dashboard` | Dashboard | Dashboard |
| `wallet` | Dompet | Wallet |
| `tx` | Transaksi | Transaction |
| `budget` | Budget | Budget |
| `recurring` | Berkala | Recurring |
| `subscription` | Langganan | Subscription |
| `debt` | Utang/Piutang | Debt |
| `invest` | Investasi | Investment |
| `asset` | Aset & Net Worth | Asset |
| `report` | Laporan | Report |
| `fire` | FIRE Calculator | Fire |
| `settings` | Pengaturan | Settings |
| `help` | Bantuan | Help |

**Auth Routes (saat belum login):**

| Nilai `authPage` | Halaman |
|---|---|
| `login` | Halaman Login |
| `register` | Halaman Register |
| `forgot` | Halaman Lupa Password |

---

## 6. Sistem Kategori

### Kategori Default

| Seksi | Kategori |
|-------|----------|
| Kebutuhan (needs) | Makanan & Minum, Transport, Utilitas, Kesehatan, Pendidikan, Belanja Bulanan |
| Keinginan (wants) | Hiburan, Makan di Luar, Fashion, Langganan, Hobi |
| Tabungan (savings) | Dana Darurat, Investasi, Dana Pensiun |
| Pemasukan (income) | Gaji, Freelance, Hasil Investasi, Lainnya |

### Aturan Pemfilteran Kategori
- Transaksi **Pemasukan** → hanya tampilkan kategori seksi `income`
- Transaksi **Pengeluaran** → tampilkan kategori seksi `needs`, `wants`, `savings`
- Transaksi **Transfer** → tidak memerlukan kategori

---

## 7. Sistem Tema

Aplikasi mendukung mode **Light** dan **Dark** menggunakan CSS custom properties.

| CSS Variable | Fungsi |
|---|---|
| `--bg` | Background utama halaman |
| `--bg-card` | Background kartu/panel |
| `--bg-2`, `--bg-3` | Background sekunder/tersier |
| `--border`, `--border-2` | Warna border |
| `--text-1` hingga `--text-6` | Hierarki warna teks |
| `--sidebar-bg` | Background sidebar |

Preferensi tema disimpan bersama state aplikasi dan diterapkan sebelum React mount untuk mencegah FOUC (Flash of Unstyled Content).

---

## 8. Persistensi Data

### Mode Lokal (Tanpa Akun)
Seluruh state aplikasi disimpan ke `localStorage` di bawah key `budgetku_state` sebagai JSON. State diperbarui setiap ada perubahan.

### Mode Terautentikasi (Firebase Firestore)
Data disimpan per-user di Firestore dengan struktur path:

```
users/{userId}/
  wallets/{walletId}
  transactions/{transactionId}
  budgets/{monthKey}
  categories/{categoryId}
  debts/{debtId}
  investments/{investmentId}
  fixedAssets/{assetId}
  subscriptions/{subscriptionId}
  recurringItems/{itemId}
  preferences/prefs
```

**Security Rules:** Hanya `request.auth.uid == userId` yang diizinkan membaca dan menulis.

---

## 9. Format & Lokalisasi

| Format | Implementasi |
|--------|-------------|
| Mata Uang (penuh) | `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })` |
| Mata Uang (singkat) | Jutaan → "jt", Ribuan → "rb" |
| Tanggal | `Intl.DateTimeFormat('id-ID', ...)` |
| Kunci Bulan | `YYYY-MM` |

---

## 10. Keamanan & Batasan

| Batasan | Nilai |
|---------|-------|
| Ukuran file impor maksimum | 10 MB |
| String input maksimum | 1000 karakter |
| Panjang password minimum | 8 karakter |
| Hari mundur maks (salary adjustment) | 7 hari |
| Debounce FIRE settings save | 500ms |

---

## 11. Riwayat Versi

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | Jul 2025 | Rilis awal: Dashboard, Dompet, Transaksi, Budget, Laporan |
| 1.1 | Jul 2025 | Tambah: Autentikasi Firebase, migrasi localStorage → Firestore |
| 1.2 | Aug 2025 | Tambah: Utang/Piutang, Investasi |
| 1.3 | Aug 2025 | Tambah: FIRE Calculator |
| 1.4 | Aug 2025 | Tambah: Berkala, Langganan, Aset/Net Worth |
| 1.5 | Aug 2025 | Tambah: Import/Export, Reset Data |
| 1.6 | Aug 2025 | Tambah: Custom period range, salary adjustment hari libur |
| 2.0 | Sep 2026 | Konsolidasi dokumentasi; hapus prototype HTML; hapus backend Express (full client-side Firestore) |
