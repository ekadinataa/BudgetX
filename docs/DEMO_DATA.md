# Data Demo BudgetX — Agustus–Oktober 2026

[Unduh cadangan JSON siap impor](https://budgetx.web.app/demo/budgetx-demo-agustus-oktober-2026.json).

File sumber: `public/demo/budgetx-demo-agustus-oktober-2026.json`.
Semua nama dan nominal fiktif. Oktober merupakan skenario satu bulan penuh;
saldo dompet adalah snapshot akhir skenario pada 31 Oktober 2026.

## Cara memasang pada akun demo

1. Unduh JSON lewat tautan di atas. Jika browser menampilkan isi JSON, simpan file tersebut dengan ekstensi `.json`.
2. Masuk ke akun demo di [BudgetX](https://budgetx.web.app).
3. Buka **Pengaturan → Impor Cadangan → Pilih File**.
4. Pilih `budgetx-demo-agustus-oktober-2026.json` dan periksa ringkasannya.
5. Pilih **Ganti Semua (Replace)**. Pilihan ini mengganti seluruh data akun dengan dataset demo, termasuk preferensi dan FIRE.
6. Dashboard terbuka. Jelajahi menu lainnya; Kalkulator FIRE dan Bantuan tersedia di Pengaturan.

Gunakan akun khusus demo untuk pilihan Ganti Semua. **Gabungkan (Append)** hanya
menambahkan ID baru dan mempertahankan data, saldo dompet existing, preferensi,
serta setelan FIRE. Menggabungkan file yang sama lagi tidak membuat duplikat.

## Isi dataset

| Data | Isi |
| --- | --- |
| Dompet | 4: BCA Utama, Jago Dana Darurat, GoPay, Tunai |
| Transaksi | 77: gaji, freelance, belanja, transfer, investasi, pembayaran utang/piutang |
| Anggaran | 3 bulan, pemasukan dasar Rp12 juta/bulan, alokasi 50/30/20 |
| Kategori | 18 kategori kebutuhan, keinginan, tabungan, pemasukan |
| Barang berkala | 2: sabun/deterjen dan vitamin |
| Langganan | 3: Spotify, Internet Rumah, iCloud+ |
| Utang/piutang | 2 catatan aktif beserta riwayat pembayaran |
| Investasi | 2: reksa dana dan emas, dengan transaksi pembelian tertaut |
| Aset tetap | 2: laptop kerja dan sepeda motor |
| FIRE | Usia 28, target 45, pemasukan Rp12 juta, pengeluaran Rp6 juta, aset investasi Rp4,63 juta |
| Tampilan | Terang, kerapatan standar, sudut lembut, periode bulanan |

Dashboard, Laporan, dan ringkasan Aset mengambil data dari koleksi di atas.
Bantuan berisi panduan bawaan aplikasi.

## Konsistensi angka

- Saldo awal sebelum Agustus: BCA Rp8 juta, Jago Rp4 juta, GoPay Rp150 ribu, Tunai Rp300 ribu.
- Saldo akhir: BCA Rp18.458.000, Jago Rp7.000.000, GoPay Rp333.000, Tunai Rp855.000. Total **Rp26.646.000**.
- Sisa utang Rp1 juta; piutang Rp200 ribu. Seluruh pembayaran tertaut ke transaksi dompet.
- Nilai investasi Rp4,63 juta; aset tetap Rp22,2 juta. Kekayaan bersih akhir **Rp52.676.000**.
- Transfer antar-dompet tidak dihitung sebagai pemasukan/pengeluaran eksternal.
- Pemulihan cadangan mempertahankan saldo akhir tanpa menerapkan transaksi dua kali.

Cadangan memakai envelope `budgetku: true`, `version: "1.0"`. JSON dan ZIP
ekspor terbaru mencakup seluruh koleksi, preferensi, serta setelan FIRE. ZIP
juga menyertakan empat tabel CSV dan `backup.json` lengkap. JSON v1 dan ZIP
CSV-only lama tetap dapat diimpor; data optional yang tidak ada dikosongkan
atau dikembalikan ke default pada Replace.
