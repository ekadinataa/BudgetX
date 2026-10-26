# Email Mesh sebagai komponen BudgetX

## Keputusan dan ruang lingkup

Source Email Mesh dimiliki dan dikembangkan bersama webapp dalam repositori `ekadinataa/BudgetX`, di `integrations/email-mesh/`. Tidak diperlukan repository worker terpisah atau salinan source dari home operator untuk menyiapkan environment pengembangan.

Komponen ini tetap proses Python server-side yang dioperasikan terpisah dari Hosting/Vite. Frontend tetap mengakses Firebase lewat client SDK dan tidak menerima kredensial Admin, OAuth, atau body email. Integrasi ini tidak menambah API backend HTTP untuk frontend dan tidak mengubah kontrak saldo transaksi webapp.

## Yang disertakan

- Ledger, parser multi-provider, ekstraksi MIME mandiri, outbox deterministik, publisher Firebase, rekonsiliasi dan cache kategori.
- Review receipt, penerapan keputusan per revisi, bridge Firestore, command admin dan native plugin Hermes opsional.
- Worker klasifikasi tujuan, whitelist terpisah, application metadata/kategori tanpa menerapkan ulang saldo.
- Watchdog, backup, CLI maintenance yang membutuhkan konfigurasi privat eksplisit, wrapper job, serta template systemd dan workflow n8n nonaktif.
- Bootstrap environment, dependency lock, konfigurasi fail-closed, tes sintetis offline, GitHub Actions dan dokumentasi operasional/pengembang.

## Yang sengaja tidak disertakan

Kredensial, konfigurasi aktif, database, WAL/SHM, token, profil Hermes, arsip email, data/saldo/kartu/rekening riil, backup, output job, execution history n8n, dan script per-insiden yang menyematkan receipt/keputusan privat. Langkah recovery per-insiden dijelaskan sebagai prosedur terbatas, bukan script auto-replay generik. Simpan rencana dan evidence privat bersama backup operator; jangan memublikasikannya agar checkout tampak lengkap.

## Kompatibilitas dan portabilitas

Guard project/Auth tetap dibatasi pada target demo implementasi, bukan arbitrary-user publication. Source tidak membawa mapping wallet atau checkpoint instalasi. Ekstraksi MIME tersedia dalam direktori integrasi; `harvest_dir` eksplisit tetap didukung untuk kompatibilitas. Pemanggilan Hermes memakai executable pada PATH service yang dipercaya dan profil yang dipilih secara eksplisit. Alamat notifikasi ops tidak lagi berasal dari channel privat bawaan; operator harus menetapkan target alert yang sesuai.

Maintenance kredit tidak menyematkan ID wallet atau plafon instalasi: input `--config` dan `--facilities` privat wajib, dan mode default hanya rencana. Reset checkpoint tetap operasi berisiko, membutuhkan flag apply eksplisit dan persetujuan terpisah. Tidak ada automatic repair/reset pada bootstrap atau CI.

## Makna siap digunakan setelah pull

Checkout dapat di-bootstrap dan diuji tanpa source eksternal atau rahasia produksi. Pemakaian operasional membutuhkan dependency, OAuth, Admin IAM, private config, identitas wallet, checkpoint, persetujuan aktivasi dan satu scheduler. Ini prasyarat keamanan yang tidak boleh dihilangkan dengan menyimpan rahasia di Git.

`git pull` **tidak** memasang ulang runtime lama, mengganti token, memindahkan database, mengaktifkan cron/n8n/plugin, menerapkan keputusan receipt, memigrasikan posisi, atau men-deploy Hosting. Pembaruan runtime harus direview, diuji, di-backup dan dipasang atomik melalui izin action-and-target terpisah. Jangan menjalankan dua checkout sebagai publisher terhadap state/akun yang sama.

## Titik masuk dokumentasi

- [README integrasi](../integrations/email-mesh/README.md)
- [Setup dan aktivasi](../integrations/email-mesh/docs/setup.md)
- [Konfigurasi](../integrations/email-mesh/docs/configuration.md)
- [Arsitektur/data](../integrations/email-mesh/docs/architecture.md)
- [Operasi dan recovery](../integrations/email-mesh/docs/operations.md)
- [Developer guide](../integrations/email-mesh/docs/development.md)
- [Otomasi](../integrations/email-mesh/docs/automation.md)
- [Kebijakan keamanan](../integrations/email-mesh/SECURITY.md)
- [Verifikasi rilis](../integrations/email-mesh/docs/validation.md)

Frontend yang sudah di-Hosting dan worker yang sedang aktif merupakan release target berbeda. Push integrasi ke GitHub bukan klaim bahwa portability changes di source ini sudah dipasang pada runtime yang berjalan.
