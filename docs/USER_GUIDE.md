# BudgetX — Panduan Pengguna

**Versi:** 1.0  
**Terakhir Diperbarui:** 1 Oktober 2026

---

## 1. Pendahuluan

### Apa itu BudgetX?

BudgetX adalah aplikasi pengelola keuangan pribadi berbasis web yang dirancang khusus untuk pengguna Indonesia. Dengan BudgetX, kamu bisa:

- 📊 Mencatat pemasukan dan pengeluaran harian
- 💰 Merencanakan budget bulanan dengan metode 50/30/20
- 🏦 Mengelola banyak dompet (bank, e-wallet, tunai, dll)
- 📦 Melacak barang berkala dan biaya amortisasi
- 💳 Mencatat utang/piutang dengan perhitungan bunga anuitas
- 📈 Memantau portofolio investasi
- 🔥 Merencanakan pensiun dini dengan FIRE Calculator
- 📋 Melihat laporan keuangan visual

### Cara Akses

Buka browser dan kunjungi: **https://budgetx.web.app**

Aplikasi ini responsif — bisa diakses dari desktop maupun handphone.

---

## 2. Memulai

### 2.1 Buat Akun Baru (Register)

1. Buka https://budgetx.web.app
2. Klik **"Daftar"** di halaman login
3. Masukkan email dan password
4. Klik **"Daftar"**
5. Kamu akan langsung masuk ke Dashboard

Data kamu disimpan di cloud — bisa diakses dari perangkat manapun.

### 2.2 Login

1. Buka https://budgetx.web.app
2. Masukkan email dan password yang sudah terdaftar
3. Klik **"Masuk"**

Lupa password? Klik **"Lupa Password?"** untuk menerima email reset.

### 2.3 Mode Tanpa Akun (Local-Only)

Jika kamu tidak ingin membuat akun, aplikasi tetap bisa digunakan sepenuhnya. Data disimpan di browser (localStorage). 

> ⚠️ **Catatan:** Data hanya tersimpan di browser/perangkat ini. Jika kamu hapus data browser atau ganti perangkat, data akan hilang.

### 2.4 Navigasi Dasar

**Desktop (layar lebar):**
- Sidebar di sebelah kiri dengan menu navigasi
- Klik nama halaman untuk berpindah
- Tombol collapse/expand untuk menyembunyikan sidebar

**Mobile (handphone):**
- Bottom navigation bar di bawah layar (Dashboard, Transaksi, +, Laporan, Pengaturan)
- Tombol **"+"** (FAB) di tengah untuk tambah transaksi cepat
- Tap avatar/ikon di pojok kanan atas untuk menu tambahan (Dompet, Budget, Berkala, Utang, Investasi)

---

## 3. Dashboard

Dashboard adalah halaman utama yang menampilkan ringkasan keuanganmu.

### 3.1 Hero Card (Mobile)

Kartu besar di bagian atas menampilkan:
- **Total Saldo** — jumlah seluruh saldo di semua dompetmu
- **Pemasukan bulan ini** — total uang masuk bulan ini
- **Pengeluaran bulan ini** — total uang keluar bulan ini

Format singkat: "1,5jt" = Rp1.500.000, "500rb" = Rp500.000

### 3.2 Stat Cards

Empat kartu statistik utama:

| Kartu | Isi |
|-------|-----|
| Budget Hari Ini | Sisa budget harian (pemasukan ÷ jumlah hari) |
| Pemasukan Bulan Ini | Total income bulan berjalan |
| Pengeluaran Bulan Ini | Total pengeluaran + persentase dari pemasukan |
| Total Saldo | Saldo gabungan semua dompet |

### 3.3 Quick Menu (Mobile)

Grid shortcut untuk akses cepat ke:
- Budget
- Berkala (Barang Berkala)
- Utang/Piutang
- Investasi
- Dompet
- Laporan
- FIRE Calculator

### 3.4 Kalender Transaksi

Kalender bulanan yang menampilkan titik/dot pada tanggal yang memiliki transaksi. Warna titik berbeda untuk pemasukan (hijau) dan pengeluaran (merah). Gunakan tombol panah untuk berpindah bulan.

### 3.5 Widget Dashboard

- **Restock Reminder** — Daftar barang berkala yang perlu dibeli ulang dalam 7 hari ke depan
- **Utang Jatuh Tempo** — Utang/piutang yang mendekati atau melewati tanggal jatuh tempo
- **Portofolio Investasi** — Ringkasan total nilai investasi dan profit/loss

---

## 4. Dompet

Menu **Dompet** digunakan untuk mengelola semua rekening dan dompet kamu.

### 4.1 Tambah Dompet Baru

1. Buka halaman **Dompet**
2. Klik tombol **"+ Tambah Dompet"**
3. Isi form:
   - **Nama** — Nama dompet (misal: "BCA", "GoPay", "Tunai")
   - **Jenis** — Pilih tipe dompet
   - **Saldo Awal** — Saldo saat ini
   - **Warna** — Pilih warna untuk identifikasi visual
   - **Catatan** — Opsional (misal: 4 digit terakhir rekening)
4. Klik **"Simpan"**

### 4.2 Jenis Dompet

| Jenis | Deskripsi | Contoh |
|-------|-----------|--------|
| Bank | Rekening bank konvensional | BCA, BNI, Mandiri, BRI |
| E-Wallet | Dompet digital | GoPay, OVO, DANA, ShopeePay |
| Kartu Kredit | Kartu kredit | Visa, Mastercard |
| PayLater | Layanan bayar nanti | Kredivo, Akulaku, SPayLater |
| Tunai | Uang cash fisik | Dompet, Celengan |

Kartu Kredit dan PayLater memisahkan **Plafon** dari **Saldo**:
- Saldo negatif = utang; saldo positif = lebih bayar; saldo 0 = belum ada utang.
- Plafon dan Hold opsional, angka nonnegatif. Hold mencadangkan sebagian limit tanpa mengubah saldo.
- **Outstanding** = maksimum dari `-saldo` dan 0.
- **Limit tersedia** = maksimum dari `plafon + saldo - hold` dan 0; lebih bayar dapat membuat limit tersedia melebihi plafon.
- Dompet lama tanpa plafon tetap menyimpan saldo yang sama; plafon/limit tersedia tampil **Belum diatur**, bukan otomatis diambil dari saldo positif.
- Form edit menampilkan estimasi outstanding/limit tersedia. Kosong mempertahankan nilai sebelumnya; isi 0 untuk menolkan plafon/hold.
- Pembelian dicatat sebagai Pengeluaran dari dompet kredit. Pelunasan dicatat sebagai Transfer dari bank ke dompet kredit, bukan pengeluaran kedua.
- Plafon/hold tidak menambah aset atau saldo bersih. Cadangan JSON/ZIP dan CSV dompet mempertahankan kedua nilai.

### 4.3 Edit dan Hapus Dompet

- **Edit:** Klik tombol Edit pada dompet → ubah informasi → Simpan.
- Jika saldo berubah, dialog **Konfirmasi Penyesuaian Saldo** menampilkan saldo sebelumnya, saldo baru, dan selisih bertanda +/−. Isi **alasan perubahan** (wajib, maksimal 1000 karakter), lalu konfirmasi; Batal tidak menyimpan perubahan.
- Riwayat transaksi mencatat **Penyesuaian Saldo**, termasuk alasan dan saldo sebelum/sesudah. Penyesuaian memengaruhi saldo, tetapi tidak dihitung sebagai pemasukan, pengeluaran, atau pemakaian budget.
- Saldo awal saat membuat dompet tidak menghasilkan penyesuaian. Edit nama/warna/catatan/plafon/hold tanpa perubahan saldo juga tidak menghasilkan transaksi.
- Jika saldo berubah karena sinkronisasi saat dialog terbuka, klik **Tinjau Ulang Saldo** sebelum konfirmasi. Gagal menyimpan akan mempertahankan dialog dan menampilkan error.
- Penyesuaian tidak dapat diedit atau diberi kategori dari form transaksi biasa. Menghapusnya membalik efek selisih pada saldo saat ini.
- Untuk transaksi nyata yang lupa dicatat, gunakan **Tambah Transaksi** agar laporan dan budget tetap akurat.
- Impor CSV cloud menyimpan transaksi dan perubahan saldo bersama. Jika file melebihi batas 500 operasi (termasuk kategori baru dan pembaruan dompet), pecah CSV menjadi bagian lebih kecil; file terlalu besar ditolak tanpa perubahan data.
- **Hapus:** Klik dompet → tombol Hapus → konfirmasi

> ⚠️ Menghapus dompet tidak menghapus transaksi yang terkait.

---

## 5. Transaksi

### 5.1 Tambah Transaksi

1. Klik tombol **"+"** (FAB di mobile, atau tombol "Tambah" di desktop)
2. Pilih tipe:
   - **Pengeluaran** — Uang keluar
   - **Pemasukan** — Uang masuk
   - **Transfer** — Pindah antar dompet
3. Isi detail:
   - **Tanggal** — Pilih tanggal transaksi
   - **Dompet** — Pilih dompet sumber
   - **Jumlah** — Masukkan nominal (atau gunakan tombol cepat)
   - **Kategori** — Pilih dari grid emoji
   - **Catatan** — Deskripsi singkat
   - **Tag** — Label opsional (bisa lebih dari satu)
   - **Ke Dompet** — Khusus transfer: pilih dompet tujuan
4. Klik **"Simpan"**

### 5.2 Tombol Jumlah Cepat

Gunakan tombol preset untuk input cepat:

| Tombol | Nilai |
|--------|-------|
| 10rb | Rp10.000 |
| 20rb | Rp20.000 |
| 25rb | Rp25.000 |
| 50rb | Rp50.000 |
| 100rb | Rp100.000 |
| 200rb | Rp200.000 |
| 500rb | Rp500.000 |

### 5.3 Pilih Kategori (Grid Emoji)

Kategori ditampilkan sebagai grid emoji yang mudah dipilih:

**Kebutuhan:** 🍔 Makanan, 🚗 Transport, 💡 Utilitas, 💊 Kesehatan, 📚 Pendidikan, 🛒 Belanja Bulanan

**Keinginan:** 🎮 Hiburan, 🍽️ Makan di Luar, 👕 Fashion, 📱 Langganan, 🎨 Hobi

**Tabungan:** 🛡️ Dana Darurat, 📈 Investasi, 🏖️ Dana Pensiun

**Pemasukan:** 💰 Gaji, 💻 Freelance, 💵 Hasil Investasi, 📦 Lainnya

### 5.4 Filter Transaksi

Gunakan filter di bagian atas halaman Transaksi:

- **Per Bulan** — Pilih bulan tertentu
- **Custom Range** — Pilih tanggal mulai dan akhir
- **Semua Waktu** — Tampilkan semua transaksi

Filter tambahan:
- Per dompet
- Per tipe (Pemasukan/Pengeluaran/Transfer)
- Per kategori
- Per tag
- Pencarian teks (di catatan)

### 5.5 Edit dan Hapus Transaksi

1. Tap/klik transaksi untuk membuka detail
2. Klik **"Edit"** untuk mengubah
3. Klik **"Hapus"** untuk menghapus

> 💡 Saldo dompet otomatis terupdate saat transaksi dibuat, diedit, atau dihapus.

---

## 6. Budget

### 6.1 Set Pemasukan Bulanan

1. Buka halaman **Budget**
2. Klik **"Set Pemasukan"**
3. Masukkan total pemasukan bulanan kamu
4. Klik **"Simpan"**

Pemasukan ini menjadi dasar alokasi budget.

### 6.2 Alokasi 50/30/20

BudgetX menggunakan metode alokasi populer:

| Bagian | % Panduan | Deskripsi |
|--------|-----------|-----------|
| **Kebutuhan** | 50% | Pengeluaran wajib (makanan, transport, utilitas) |
| **Keinginan** | 30% | Pengeluaran opsional (hiburan, fashion, hobi) |
| **Tabungan** | 20% | Simpanan & investasi (dana darurat, investasi) |

Kamu bisa mengubah persentase dan detail alokasi per kategori sesuai kebutuhan.

**Cara edit alokasi:**
1. Klik bagian yang ingin diedit (Kebutuhan/Keinginan/Tabungan)
2. Atur total alokasi untuk bagian tersebut
3. Atur jumlah budget per kategori
4. Simpan

### 6.3 Mode Periode

BudgetX mendukung 3 mode periode budget:

**Per Bulan (Default)**
- Periode: tanggal 1 sampai akhir bulan
- Cocok untuk yang gajian tanggal 1

**Custom Siklus**
- Periode berdasarkan tanggal gajian (misal: 25 bulan ini sampai 24 bulan depan)
- Atur tanggal mulai siklus (1–28)
- Opsi: sesuaikan ke hari kerja terdekat (jika tanggal gaji jatuh di weekend)

**Custom Rentang**
- Periode bebas: pilih tanggal mulai dan akhir sendiri
- Cocok untuk proyek freelance atau periode khusus

### 6.4 Monitoring Pengeluaran vs Budget

Halaman Budget menampilkan:
- **Progress bar per bagian** — Seberapa banyak yang sudah terpakai
- **Progress bar per kategori** — Detail per item
- **Badge "OVER"** — Muncul jika pengeluaran melebihi budget
- **Warna indikator:**
  - 🟢 Hijau: < 80% terpakai
  - 🟡 Kuning: 80–100% terpakai
  - 🔴 Merah: > 100% (melebihi budget)

---

## 7. Barang Berkala

Fitur untuk melacak barang yang dibeli secara rutin (skincare, shampoo, vitamin, dll) dan menghitung biaya bulanan sebenarnya.

### 7.1 Tambah Item Berkala

1. Buka halaman **Berkala**
2. Klik **"+ Tambah Item"**
3. Isi:
   - **Nama** — Nama barang (misal: "Sunscreen Skin Aqua")
   - **Kategori** — Pilih kategori pengeluaran
   - **Dompet** — Dompet default untuk pembelian
   - **Harga** — Harga beli
   - **Durasi** — Berapa lama barang ini habis (dalam hari)
   - **Tanggal Beli Terakhir** — Kapan terakhir beli
   - **Catatan** — Opsional
4. Klik **"Simpan"**

### 7.2 Duration Shortcuts

Tombol cepat untuk durasi umum:

| Tombol | Hari |
|--------|------|
| 2 Minggu | 14 hari |
| 1 Bulan | 30 hari |
| 1.5 Bulan | 45 hari |
| 2 Bulan | 60 hari |
| 3 Bulan | 90 hari |
| 6 Bulan | 180 hari |
| 1 Tahun | 365 hari |

### 7.3 Cara Baca Biaya Amortized

**Biaya bulanan amortisasi** = Harga ÷ Durasi (hari) × 30

Contoh:
- Sunscreen Rp89.000, habis dalam 60 hari
- Biaya bulanan = 89.000 ÷ 60 × 30 = **Rp44.500/bulan**

Ini menunjukkan biaya "sebenarnya" per bulan dari barang yang tidak dibeli setiap bulan.

### 7.4 Restock Reminder

Item berkala otomatis ditandai berdasarkan status:

| Status | Warna | Artinya |
|--------|-------|---------|
| 🔴 Perlu Restock | Merah | Sudah lewat atau < 7 hari lagi |
| 🟡 Segera | Kuning | Dalam 7 hari ke depan |
| ✅ Masih Tersedia | Hijau | Masih > 7 hari |
| ⏸️ Non-aktif | Abu | Item dinonaktifkan |

Reminder juga muncul di Dashboard sebagai widget.

### 7.5 Catat Pembelian Ulang

1. Klik tombol **"Sudah Beli"** pada item
2. Isi:
   - **Tanggal beli** — Kapan kamu beli ulang
   - **Harga** — Harga baru (bisa berubah)
   - **Dompet** — Dompet yang dipakai
   - **Buat transaksi?** — Centang jika ingin otomatis tercatat sebagai pengeluaran
3. Klik **"Konfirmasi"**

Tanggal "perlu beli berikutnya" otomatis dihitung ulang.

---

## 8. Utang/Piutang

### 8.1 Catat Utang Baru

Utang = uang yang kamu pinjam dari orang lain.

1. Buka halaman **Utang/Piutang**
2. Klik **"+ Tambah"**
3. Pilih tipe: **Utang**
4. Isi:
   - **Nama orang** — Siapa yang meminjamkan
   - **Jumlah** — Nominal pinjaman
   - **Dompet** — Dompet yang menerima uang
   - **Tanggal jatuh tempo** — Opsional
   - **Deskripsi** — Opsional
5. Opsi bunga anuitas (lihat 8.4)
6. Klik **"Simpan"**

> 💡 Saat utang dibuat, otomatis tercatat sebagai transaksi pemasukan (karena uang masuk ke dompetmu).

### 8.2 Catat Piutang

Piutang = uang yang kamu pinjamkan ke orang lain.

Prosesnya sama seperti utang, tapi pilih tipe **Piutang**. Otomatis tercatat sebagai transaksi pengeluaran (uang keluar dari dompetmu).

### 8.3 Bayar Cicilan

1. Pada kartu utang/piutang, klik **"Bayar"**
2. Masukkan:
   - **Jumlah pembayaran** — Nominal yang dibayar
   - **Tanggal** — Tanggal pembayaran
   - **Dompet** — Dompet yang dipakai
   - **Catatan** — Opsional
3. Klik **"Konfirmasi"**

Sisa utang otomatis berkurang. Jika lunas, status berubah jadi "Lunas ✓".

### 8.4 Bunga Anuitas

Untuk pinjaman berbunga (KPR, KTA, kredit motor, dll):

1. Saat membuat utang, aktifkan toggle **"Bunga Anuitas"**
2. Isi:
   - **Suku Bunga (% per tahun)** — Misal: 12%
   - **Tenor (bulan)** — Lama pinjaman, misal: 24 bulan
   - **Tanggal Mulai** — Kapan pinjaman dimulai
3. Cicilan bulanan otomatis dihitung

**Cara kerja bunga anuitas:**
- Cicilan tetap setiap bulan
- Di awal, porsi bunga lebih besar
- Semakin lama, porsi pokok makin besar
- Rumus: M = P × [r(1+r)^n] / [(1+r)^n - 1]

### 8.5 Tabel Amortisasi

Untuk utang berbunga, tersedia tabel amortisasi yang menampilkan:

| Bulan | Cicilan | Pokok | Bunga | Sisa |
|-------|---------|-------|-------|------|
| 1 | Rp500.000 | Rp350.000 | Rp150.000 | Rp9.650.000 |
| 2 | Rp500.000 | Rp353.500 | Rp146.500 | Rp9.296.500 |
| ... | ... | ... | ... | ... |

Cicilan yang sudah dibayar ditandai dengan ✓.

---

## 9. Investasi

### 9.1 Tambah Investasi

1. Buka halaman **Investasi**
2. Klik **"+ Tambah Investasi"**
3. Isi:
   - **Nama** — Nama investasi (misal: "Reksadana BNI-AM")
   - **Jenis Aset** — Pilih dari 8 jenis
   - **Catatan** — Opsional
   - **Detail khusus** (tergantung jenis aset)
4. Klik **"Simpan"**

### Jenis Aset yang Didukung

| Jenis | Deskripsi | Field Khusus |
|-------|-----------|--------------|
| 🏦 Deposito | Tabungan berjangka | Suku bunga, jatuh tempo, nama bank |
| 📊 Saham | Saham/ekuitas | Kode saham (ticker) |
| ₿ Crypto | Cryptocurrency | Nama koin |
| 🥇 Emas | Logam mulia | — |
| 📈 Reksadana | Dana kelolaan | Nama fund, manajer investasi |
| 📜 Obligasi | Surat utang | Jatuh tempo |
| 🤝 P2P Lending | Pinjaman peer-to-peer | Suku bunga |
| 📦 Lainnya | Investasi lain | — |

### 9.2 Catat Pembelian (Beli)

1. Pada kartu investasi, klik **"Beli"**
2. Isi:
   - **Tanggal** — Tanggal pembelian
   - **Jumlah Unit** — Berapa unit/lot/gram yang dibeli
   - **Harga per Unit** — Harga satuan
   - **Dompet** — Dompet yang dipakai bayar
3. Klik **"Simpan"**

Total otomatis dihitung (unit × harga). Transaksi pengeluaran otomatis tercatat.

### 9.3 Catat Penjualan (Jual)

1. Pada kartu investasi, klik **"Jual"**
2. Isi detail serupa dengan pembelian
3. Klik **"Simpan"**

Transaksi pemasukan otomatis tercatat.

### 9.4 Update Nilai Pasar

1. Pada kartu investasi, klik **"Update Nilai"**
2. Masukkan nilai pasar terkini
3. Klik **"Simpan"**

> 💡 Untuk **Deposito**, nilai otomatis dihitung berdasarkan bunga harian yang terakumulasi.

### 9.5 Baca Profit/Loss

Setiap investasi menampilkan:

- **Nilai Sekarang** — Nilai pasar saat ini
- **Total Modal** — Total uang yang sudah diinvestasikan
- **Profit/Loss** — Selisih nilai sekarang - modal
- **Return %** — Persentase keuntungan/kerugian

Warna: 🟢 Hijau = untung, 🔴 Merah = rugi

**Ringkasan portofolio** di bagian atas menampilkan total gabungan semua investasi.

---

## 10. Kesehatan Keuangan (Aset)

### 10.1 Memahami Health Score

Health Score adalah skor 0–100 yang mengukur kesehatan keuanganmu berdasarkan beberapa rasio keuangan. Semakin tinggi, semakin sehat kondisi finansialmu.

### 10.2 Net Worth Breakdown

Menampilkan:
- **Total Aset** — Saldo positif semua dompet + investasi + aset tetap
- **Total Liabilitas** — Utang + saldo negatif (kredit/paylater)
- **Net Worth** — Aset − Liabilitas

### 10.3 Lima Rasio Keuangan

| Rasio | Formula | Arti | Target |
|-------|---------|------|--------|
| Savings Rate | Tabungan ÷ Pemasukan | Seberapa banyak yang ditabung | ≥ 20% |
| Debt-to-Income | Total Utang ÷ Pemasukan Tahunan | Beban utang | ≤ 36% |
| Emergency Fund | Dana Darurat ÷ Pengeluaran Bulanan | Cadangan darurat | ≥ 6 bulan |
| Expense Ratio | Pengeluaran ÷ Pemasukan | Efisiensi pengeluaran | ≤ 70% |
| Investment Ratio | Investasi ÷ Net Worth | Porsi aset produktif | ≥ 30% |

### 10.4 Aset Tetap

Catat aset non-likuid seperti:
- Rumah/Properti
- Mobil/Motor
- Perhiasan
- Elektronik bernilai tinggi

Aset tetap masuk dalam perhitungan Net Worth tapi tidak termasuk aset likuid.

### 10.5 Rekomendasi Otomatis

Berdasarkan kondisi keuanganmu, sistem memberikan rekomendasi otomatis:
- "Tingkatkan dana darurat ke 6× pengeluaran bulanan"
- "Kurangi rasio utang — targetkan di bawah 36%"
- "Savings rate bagus! Pertahankan di atas 20%"

---

## 11. FIRE Calculator

### 11.1 Apa itu FIRE?

**FIRE** = Financial Independence, Retire Early

Konsep merencanakan kebebasan finansial — titik di mana kamu tidak lagi perlu bekerja karena hasil investasi cukup untuk membiayai hidup.

**Angka FIRE** = Pengeluaran Bulanan × 12 × 25

Artinya: kamu perlu 25 tahun pengeluaran tahunan dalam bentuk investasi agar bisa "pensiun".

### 11.2 Input Data Finansial

| Field | Keterangan |
|-------|-----------|
| Umur Sekarang | Usia kamu saat ini |
| Umur Pensiun Target | Kapan ingin pensiun |
| Pemasukan Bulanan | Gaji/pendapatan per bulan |
| Pengeluaran Bulanan | Total pengeluaran per bulan |
| Aset FIRE Saat Ini | Total investasi yang sudah ada |

> 💡 Gunakan tombol **"Auto"** untuk mengisi otomatis dari data transaksi dan investasi kamu.

### 11.3 Alokasi Pendapatan

Atur pembagian pendapatan:
- **Pokok** — Kebutuhan dasar (%)
- **Hiburan** — Keinginan (%)
- **FIRE** — Investasi untuk FI (%)
- **Emas** — Investasi emas (%)

Total harus = 100%

### 11.4 Asumsi Pasar (Slider)

| Parameter | Range | Default |
|-----------|-------|---------|
| Return Investasi | 1–20% | 10% |
| Kenaikan Gaji | 0–15% | 5% |
| Inflasi | 1–12% | 5% |
| Return Pasca-Pensiun | 1–12% | 6% |

Geser slider untuk menyesuaikan asumsi. Chart otomatis update.

### 11.5 Baca Proyeksi Chart

Grafik garis menampilkan 3 skenario pertumbuhan portofolio:
- 🟢 **Optimis** — Return + 2% dari asumsi
- 🔵 **Moderat** — Sesuai asumsi
- 🔴 **Pesimis** — Return − 2% dari asumsi

Garis horizontal merah = **Angka FIRE** (target)

Jika garis portofolio melewati garis FIRE, artinya kamu sudah mencapai Financial Independence di umur tersebut.

### 11.6 Tab Saran, Akumulasi, Pensiun

**Tab Saran:**
- Rekomendasi personal berdasarkan kondisi keuanganmu
- Peringatan jika savings rate terlalu rendah
- Tips meningkatkan kecepatan menuju FIRE

**Tab Akumulasi:**
- Tabel tahun per tahun: tabungan tahunan, nilai portofolio, pertumbuhan
- Menunjukkan kapan kamu akan mencapai angka FIRE

**Tab Pensiun:**
- Simulasi setelah pensiun
- Berapa tahun portofolio bertahan jika kamu berhenti bekerja
- Penarikan tahunan vs return investasi konservatif

---

## 12. Laporan

### 12.1 Cashflow Bulanan

Tiga kartu metrik:
- **Total Pemasukan** — Semua income bulan ini
- **Total Pengeluaran** — Semua expense + perubahan vs bulan lalu
- **Net Cashflow** — Pemasukan − Pengeluaran (biru = positif, merah = negatif)

### 12.2 Pengeluaran per Kategori

**Pie chart** yang menampilkan:
- Top 6 kategori pengeluaran terbesar
- Jumlah (Rp) dan persentase masing-masing
- Legend berwarna untuk identifikasi

### 12.3 Performa Budget

Performa per bagian (Kebutuhan/Keinginan/Tabungan):
- Progress bar terpakai vs alokasi
- Detail per kategori
- Badge "OVER" untuk yang melebihi budget
- Peringatan "Melebihi!" untuk bagian yang over

### 12.4 Perbandingan Bulan

- **Bar chart** membandingkan pemasukan dan pengeluaran bulan ini vs bulan lalu
- **Daily expense chart** — Pengeluaran harian sepanjang periode billing
- Membantu identifikasi pola pengeluaran

---

## 13. Pengaturan

### 13.1 Export Data

**Format JSON:**
1. Buka **Pengaturan**
2. Pada **Ekspor Data**, pilih **JSON**, lalu klik **Ekspor**
3. File `.json` otomatis terdownload

Cadangan mencakup dompet, transaksi, anggaran, kategori, barang berkala,
langganan, utang/piutang, investasi, aset tetap, preferensi tampilan/periode,
dan setelan FIRE, termasuk riwayat pembayaran dan pembelian.

**Format CSV:**
1. Pada **Ekspor Data**, pilih **CSV (ZIP)**, lalu klik **Ekspor**
2. File `.zip` berisi empat tabel CSV dan `backup.json` lengkap terdownload

### 13.2 Import Data

**Restore Backup:**
1. Pada **Impor Cadangan**, klik **Pilih File**
2. Pilih file JSON atau ZIP backup
3. Preview ringkasan (jumlah dompet, transaksi, dll)
4. Pilih mode:
   - **Ganti Semua (Replace)** — Timpa seluruh data, preferensi, dan setelan FIRE. Data optional yang tidak ada di cadangan lama kembali kosong/default.
   - **Gabungkan (Append)** — Tambahkan ID baru, lewati yang sudah ada. Data dan preferensi existing tetap dipertahankan.
5. Klik metode yang dipilih untuk menerapkan impor

Cadangan JSON v1 dan ZIP CSV-only lama tetap didukung. Saldo akhir dompet
dipulihkan apa adanya; transaksi cadangan tidak diterapkan ulang ke saldo.

Untuk mencoba semua menu, unduh [data demo Agustus–Oktober 2026](https://budgetx.web.app/demo/budgetx-demo-agustus-oktober-2026.json)
dan ikuti [panduan akun demo](DEMO_DATA.md).

**Import CSV Multi-file:**
1. Klik **"Import CSV"**
2. Upload file terpisah untuk Transaksi, Budget, dan/atau Dompet
3. Ikuti format yang ditampilkan:
   - Transaksi: `Tanggal,Tipe,Jumlah,Kategori,Sub Kategori,Dompet,Ke Dompet,Catatan`
   - Budget: `Periode,Total Pemasukan,Bagian,Kategori,Alokasi`
   - Wallet: `Nama,Tipe,Saldo,Catatan`
4. Konfirmasi import

### 13.3 Reset Data

> ⚠️ **Peringatan:** Aksi ini tidak bisa dibatalkan!

1. Klik **"Reset Data"**
2. Ketik **"RESET"** di kotak konfirmasi
3. Klik **"Konfirmasi Reset"**

Semua data (dompet, transaksi, budget, kategori, utang, investasi) akan dihapus dan dikembalikan ke default.

### 13.4 Kelola Kategori

1. Buka **Pengaturan** → bagian **Kategori**
2. Kategori dikelompokkan: Kebutuhan, Keinginan, Tabungan, Pemasukan
3. Untuk setiap kategori:
   - **Edit** — Ubah nama dan warna
   - **Hapus** — Hanya bisa jika tidak dipakai di transaksi/budget
   - **Tambah** — Buat kategori baru di bagian manapun

### 13.5 Ganti Tema (Dark/Light)

- **Desktop:** Toggle di bagian bawah sidebar
- **Mobile:** Tap avatar → toggle tema di dropdown menu

---

## 14. FAQ & Tips

### Tips Hemat

1. **Catat semua pengeluaran** — Sekecil apapun. Pengeluaran "receh" yang berulang bisa besar akumulasinya.
2. **Review mingguan** — Luangkan 5 menit setiap Minggu untuk cek pengeluaran minggu ini.
3. **Gunakan Budget** — Set budget dan pantau. Awareness = kontrol.
4. **Pisahkan dompet** — Buat dompet khusus untuk "uang jajan" agar tidak overspending.
5. **Gunakan fitur Berkala** — Ketahui biaya "tersembunyi" bulanan dari barang-barang yang tidak dibeli setiap bulan.

### Cara Pakai Aturan 50/30/20

Dengan gaji Rp10.000.000/bulan:

| Bagian | Alokasi | Contoh Isi |
|--------|---------|-----------|
| Kebutuhan (50%) | Rp5.000.000 | Makan, transport, utilitas, asuransi |
| Keinginan (30%) | Rp3.000.000 | Hiburan, fashion, makan di luar, langganan |
| Tabungan (20%) | Rp2.000.000 | Dana darurat, investasi, dana pensiun |

> 💡 Ini panduan, bukan aturan kaku. Sesuaikan dengan kondisi kamu. Yang penting: tabungan minimal 20%.

### Berapa Dana Darurat Ideal?

| Status | Rekomendasi |
|--------|-------------|
| Single, belum ada tanggungan | 3–6 bulan pengeluaran |
| Sudah menikah | 6–9 bulan pengeluaran |
| Punya anak / wirausaha | 9–12 bulan pengeluaran |

Contoh: Pengeluaran Rp5jt/bulan → Dana darurat ideal = Rp30jt–Rp60jt

### Kapan Mulai Investasi?

1. ✅ Dana darurat sudah terpenuhi (minimal 3 bulan)
2. ✅ Tidak punya utang konsumtif berbunga tinggi
3. ✅ Sudah punya penghasilan tetap
4. ✅ Sudah paham risiko instrumen yang dipilih

**Urutan prioritas:**
1. Lunasi utang berbunga tinggi (kartu kredit, paylater)
2. Bangun dana darurat
3. Mulai investasi (reksadana pasar uang untuk pemula)
4. Diversifikasi (saham, obligasi, emas)

### Kenapa Saldo Dompet Saya Tidak Cocok?

Kemungkinan penyebab:
- Ada transaksi yang belum dicatat
- Edit saldo manual tidak sinkron dengan transaksi
- Transfer antar dompet tercatat ganda

**Solusi:** Buka dompet → edit manual → sesuaikan saldo → catat di catatan kenapa diubah.

### Bagaimana Jika Lupa Password?

1. Di halaman login, klik **"Lupa Password?"**
2. Masukkan email terdaftar
3. Cek inbox (dan folder spam) untuk link reset
4. Klik link → buat password baru

### Data Saya Aman?

- ✅ Data disimpan di Firebase (Google Cloud) — infrastruktur tingkat enterprise
- ✅ Setiap user hanya bisa akses datanya sendiri (security rules)
- ✅ Koneksi selalu HTTPS (terenkripsi)
- ✅ Tidak ada data sensitif yang disimpan di client
- 💡 Untuk keamanan ekstra, gunakan password yang kuat dan unik

---

## Butuh Bantuan?

Jika mengalami kendala atau punya saran, hubungi developer melalui channel yang tersedia atau buat issue di repository.

Selamat mengelola keuangan! 💪
