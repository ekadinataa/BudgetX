# Konfirmasi transaksi email-mesh di BudgetX

## Ruang lingkup

Source dasar: upstream `main` pada `5da3afe` (redesign produksi dan kartu dompet ringkas). Perubahan ini menambahkan antrean operasional **Perlu Konfirmasi** pada halaman **Transaksi**. Antrean berdiri sendiri dari filter tanggal/pencarian dan bukan daftar transaksi yang sudah tercatat.

- Pengguna meninjau nominal, biaya, waktu receipt, alasan tertahan, dan pilihan arah/dompet yang diizinkan validator kanonis.
- Pilihan tidak dipilih otomatis. Aksi **Konfirmasi & Catat** adalah keputusan untuk receipt dan revisi bukti tertentu, bukan izin umum atas suatu rekening/merchant.
- Penolakan tidak menghasilkan transaksi. Web tidak menyediakan retry finansial: retry kanonis dapat mengizinkan publikasi dan harus melalui workflow administrator yang dipercaya. Receipt dengan fakta tidak aman tidak dapat dipaksa dengan memilih dompet.
- Keputusan yang tersimpan berarti **menunggu pencatatan**, bukan **tercatat**. Hanya status processor kanonis dapat menyatakan publikasi selesai.
- Receipt pengiriman yang sudah terikat pada event tidak diberikan tombol untuk mencatat transaksi finansial baru.

## Alur cloud

1. Collector/review existing menemukan exception dan menyimpan fakta otoritatif di SQLite privat.
2. Bridge opt-in memverifikasi project dan identitas target, lalu menerbitkan proyeksi minimum ke `users/{uid}/financialReviews/{reviewId}`. Tidak memuat raw email, token, nomor rekening, atau path backup.
3. Browser berlangganan antrean secara independen. Error antrean tidak memblokir listener dompet/transaksi/Wishlist; cache yang belum dikonfirmasi server tidak mengizinkan keputusan.
4. Browser membaca ulang revisi/status secara atomik dan membuat satu dokumen keputusan immutable di `financialReviewDecisions/{reviewId}--{version}`. Tidak menyentuh koleksi transaksi atau saldo.
5. Bridge membaca keputusan tersebut, memvalidasi ulang terhadap **SQLite**, bukan pilihan/fakta mirror yang dibaca browser, lalu menyimpan keputusan receipt dengan provenance Firebase UID.
6. Processor review existing memeriksa ulang bukti, checkpoint, endpoint, marker dan komponen, kemudian memakai publisher kanonis dengan ID yang sama. Status mirror mengikuti hasil yang benar-benar tersimpan.

Revisi berubah membatalkan pilihan lama. Submit berulang dengan keputusan identik idempotent; keputusan berbeda untuk revisi yang sama ditolak. Pengguna harus meninjau revisi terbaru. Pergantian akun mengosongkan tampilan dan menonaktifkan callback sesi lama.

Proyeksi `totalCredit` mempertahankan nominal bersih penerimaan; preview efek dompet mengikuti principal `Engine.plan`, bukan selalu `amount`. Biaya transfer tidak dihitung dua kali. Flag `webDecisionAccepted` berasal dari audit per revisi kanonis; receipt blocked/keputusan yang sudah diterima diarahkan ke pemulihan administrator, bukan tombol retry yang tidak dapat mengganti keputusan immutable. Peralihan snapshot server ke cache/offline membatalkan readiness dan menonaktifkan keputusan sampai sinkronisasi server kembali.

## Security rules

Antrean mirror hanya dapat **dibaca** oleh pemilik; client tidak boleh menulis fakta/status/choices. Keputusan hanya dapat dibuat oleh UID pemilik untuk receipt/revisi/status yang sesuai, dengan field allowlist. Update/delete keputusan dari browser ditolak. Owner-only access ke koleksi aplikasi lain tetap dipertahankan; tidak ada privilege lintas UID.

Rules adalah bagian wajib rollout, bukan opsional. Frontend baru tidak boleh dipublikasikan mengandalkan rules lama yang masih mengizinkan write generik ke dua koleksi ini.

## Mode lokal

Data simulasi antrean berada di `localStorage['budgetku_financial_reviews']`, terpisah dari `budgetku_state`. Default kosong, tanpa receipt produksi. Konfirmasi simulasi hanya mengubah status antrean menjadi menunggu pencatatan dan menyimpan keputusan; **tidak** memanggil Firebase atau mengubah saldo/transaksi. Label mode lokal menjelaskan bahwa tidak ada pencatatan cloud.

Antrean dan audit keputusan merupakan state operasional; tidak diimpor sebagai transaksi dari backup aplikasi dan tidak menjalankan ulang transaksi. Restore/reset financial-review harus memakai prosedur recovery worker, bukan mengganti saldo dari browser.

## Artefak integrasi dan batas aktivasi

`integrations/email-mesh/` berisi bridge dan pengujian offline. Source worker aktif di luar repo **tidak diubah**. Tidak ada scheduler baru, migrasi/replay, perubahan akun, atau aktivasi publish dalam pengembangan ini.

Agar receipt asli tampil, diperlukan rollout terpisah yang diotorisasi: pemasangan bridge pada hook existing, verifikasi project/Auth, rules, frontend, lalu pembacaan balik antrean/keputusan/status hasil scheduled run existing. Aktivasi fitur bukan persetujuan finansial untuk backlog. Jangan menjalankan `ops.py run` sebagai smoke test atau membuat receipt produksi buatan.

## Verifikasi

Tes unit/integrasi memakai data sintetis dan Firebase mock; browser QA memakai Chrome, mode lokal dan pemblokiran endpoint backend. Tes bridge memakai publisher palsu dan SQLite temporer, bukan DB operasional. Bukti eksekusi akhir dicatat setelah seluruh partisi selesai; lulus mock tidak disamakan dengan lulus emulator rules atau live integration.
