# Kebijakan keamanan Email Mesh BudgetX

Email Mesh adalah source server-side yang dijalankan operator, bukan bagian dari bundle Vite. Firebase Admin SDK melewati Firestore Rules; UID demo dan pemeriksaan project pada worker adalah batas aplikasi tambahan, bukan pengganti IAM.

## File yang boleh dipublikasikan

- Source worker/parser, CLI automation, workflow nonaktif, dokumentasi dan fixture sintetis.
- Konfigurasi contoh dengan seluruh flags penulisan/notifikasi nonaktif dan placeholder identitas mailbox, rekening, kartu, wallet ID dan checkpoint.
- Identitas project/demo dan trusted actor yang memang menjadi konstanta guard implementasi. Ini tidak mengizinkan aktivasi ataupun memberikan akses kredensial.

## File yang tidak boleh masuk Git

OAuth client/token/refresh token, service-account private key, konfigurasi runtime, profil Hermes, environment privat, arsip email/MIME, SQLite/WAL/SHM, backup, log, response API, data/saldo/rekening/kartu riil dan script per-insiden yang menyematkan bukti privat. `.gitignore` merupakan pertahanan tambahan, bukan pengganti review staged diff dan secret scan.

Hanya Gmail `gmail.readonly` yang didukung. Jangan mencetak OAuth URL/callback/token atau mengirim authorization code/password melalui chat. Jalankan helper consent hanya dalam terminal operator yang dipercaya dan browser/loopback yang disetujui.

## Perubahan dengan efek finansial

`git pull`, bootstrap, CI dan tes sintetis tidak mengizinkan publikasi uang. Aktivasi jadwal, OAuth ulang pada instalasi publisher aktif, pemasangan worker, replay, reset, migrasi, import, restore, dan perubahan data cloud memerlukan persetujuan action-and-target tersendiri. Verifikasi project/Auth, snapshot yang bisa dipulihkan, review rencana terbatas, dan readback pasca-write wajib untuk operasi yang disetujui.

Gunakan satu publisher scheduler saja. Jangan menjalankan `ops.py run`, `mesh.py run`, `financial_review_hook.py`, atau migration untuk pemeriksaan kesehatan. `--no-publish` tetap dapat mengubah state lokal; `--notify-only` masih dapat menulis mirror/notifikasi. `doctor` memvalidasi lokal tanpa jaringan tetapi tidak membuktikan identitas cloud/mailbox.

## Melaporkan masalah

Jangan membuka issue publik yang berisi receipt, token, wallet ID, alamat pribadi atau data keuangan. Gunakan GitHub Private Vulnerability Reporting bila repository menyediakannya, atau saluran privat pemilik repository. Jika key pernah masuk Git, cabut/rotasi key dan audit akses; menghapus file atau menulis ulang history saja tidak mencabut key.

## Gate kontribusi

Jalankan suite offline, scan staged source untuk rahasia/PII/path privat, dan independent review. Pertahankan gate kepemilikan, revisi immutable, batch/increment, marker deterministik, dan deduplikasi. Pengujian live tidak boleh digantikan dengan fabricated API responses; laporkan bagian yang belum diverifikasi.
