# Nominal saldo awal deposito

## Perilaku

- Form Tambah/Edit Investasi dengan jenis Deposito menyediakan **Nominal Deposito (Rp)** dan **Tanggal Penempatan**.
- Nominal opsional untuk mempertahankan alur pembuatan record kosong → Beli dari dompet. Jika diisi, nominal harus integer Rupiah positif yang aman, tanggal penempatan valid, dan jatuh tempo tidak mendahului penempatan.
- Ini pencatatan deposito yang sudah dimiliki, bukan pembelian baru. Tidak ada transaksi dompet atau debit otomatis. Jangan mencatat penempatan yang sama sekali lagi melalui Beli.
- Field optional `principal` + `depositDate` disimpan di investment existing, baik localStorage maupun Firestore. Tidak ada koleksi baru, migrasi, atau write-on-read.
- Opening holding diturunkan sebagai satu unit hanya untuk perhitungan; entry turunan tidak disimpan dalam riwayat transaksi ataupun backup.
- Modal, nilai berjalan, proyeksi sisa posisi, Aset/net worth dan Auto FIRE menggunakan valuasi bersama. Bunga sederhana bruto mengikuti perhitungan harian existing dan berhenti pada tanggal jatuh tempo (bukan perpanjangan ARO otomatis).
- Transaksi diurutkan stabil berdasarkan tanggal untuk modal dan valuasi; pembelian tambahan serta pencairan proporsional diperhitungkan konsisten.
- Setelah terdapat riwayat Beli/Jual, field nominal menunjukkan modal tersisa dan saldo awal tidak dapat diubah melalui form. Payload metadata tidak mengganti riwayat maupun opening fields; validasi memakai hasil merge dengan record original.
- JSON dan ZIP mempertahankan opening fields; backup legacy tanpa field baru tetap valid.

## Verifikasi lokal

Browser UAT memaksa modul Firebase `auth=null; db=null` melalui `localOnly`, memblokir request Firebase, dan memakai data sintetis. Server Vite existing di port 5175 digunakan; percobaan menjalankan server baru dengan env kosong berhenti karena port sudah dipakai. Env server existing tidak diasumsikan kosong. Tidak ada sign-in, cloud write, push atau deploy.

- RED→GREEN: input nominal, modal/bunga awal, persistensi service cloud bermock, validasi nominal/tanggal, konsistensi net worth, transaksi backdated, validasi metadata setelah transaksi, dan Auto FIRE.
- Browser Chrome desktop 1280px dan mobile 390px, light/dark: tambah, edit nominal, reload, proyeksi nonzero, tanpa perubahan wallets/transactions selama pencatatan opening, kontras, geometri dialog, Auto FIRE, lalu pencairan yang mencatat income dan menutup posisi. Tidak ada pageerror pada skenario ini.
- JSON/ZIP roundtrip dan service mock create/update lulus. Cloud production tidak diuji dengan penulisan nyata.
- Full suite terakhir: **79 file, 1.062 test; 1.052 lulus, 10 gagal, tanpa skip**. Empat file gagal berada pada area financial-review/global-class, terkait payload tambahan `categoryId: null` dan `.txReviewOptional` pada perubahan lokal Transactions/financialReview yang sudah ada saat tugas dimulai. Perubahan tersebut tidak disentuh oleh tugas deposito. Full suite tidak diklaim hijau.
- `npm run lint`, `npm run build`, dan `git diff --check` lulus. Build masih memperingatkan chunk di atas 500 kB; jsdom full suite mencetak warning `Window.scrollTo`.

Command:

```sh
VITE_FIREBASE_API_KEY='' VITE_FIREBASE_AUTH_DOMAIN='' VITE_FIREBASE_PROJECT_ID='' npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
BUDGETX_PLAYWRIGHT_PATH=/home/ekadinataa/.local/share/budgetx-tools/node_modules/playwright UAT_URL=http://127.0.0.1:5175 npm test -- --maxWorkers=2
npm run lint
npm run build
```

## Pengamanan sebelum rilis

- Jenis aset investasi yang sudah memiliki nominal awal deposito atau riwayat Beli/Jual dikunci. Guard bukan hanya atribut UI: App memvalidasi payload hasil merge dengan record original sebelum mengubah state lokal maupun memanggil service cloud.
- Penjualan memvalidasi seluruh urutan posisi, termasuk opening holding dan kandidat penjualan, dengan urutan tanggal stabil yang sama dengan valuasi. Penjualan sebelum posisi tersedia, tanggal tidak valid, dan penjualan backdated yang membuat penjualan berikutnya kekurangan unit ditolak sebelum transaksi dompet dibuat.
- Dialog Jual memakai validator yang sama sehingga input ditolak dengan pesan tanpa menutup dialog; penjualan pada tanggal penempatan tetap diizinkan bila unit mencukupi.
- Regresi mencakup UI, validator murni, handler App lokal/cloud bermock (tidak ada write pada input ditolak), serta Chrome desktop/mobile × light/dark. Tidak ada migrasi ataupun perbaikan otomatis terhadap data pengguna.

## Temuan di luar lingkup

Skenario pencairan mode lokal memperlihatkan handler transaksi existing menambahkan transaksi income tetapi tidak mengubah field `wallet.balance` di localStorage (`App.jsx` handleCreateTransaction local branch). Pemeriksaan deposito memverifikasi transaksi income dan posisi investasi yang ditutup, **bukan** mengklaim saldo wallet lokal telah dikreditkan. Perilaku umum transaksi/wallet lokal ini tidak diubah dalam tugas penambahan nominal; perlu perbaikan terpisah dengan regresi seluruh jalur transaksi. Cloud accounting tetap menggunakan service transaksi existing dan belum diuji dengan write production.
