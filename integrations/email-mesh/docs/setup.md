# Setup dan aktivasi

## 1. Instalasi pengembangan bersih

Jalankan dari checkout BudgetX, bukan direktori worker operasional:

```bash
cd integrations/email-mesh
./scripts/bootstrap.sh
.venv/bin/python scripts/manage.py check
```

Gunakan Python 3.11+ dan lingkungan POSIX. `uv` merupakan jalur utama; fallback memerlukan modul `venv`/`ensurepip` dan pip yang tersedia pada distribusi Python. Jika bootstrap gagal karena paket OS atau jaringan, perbaiki prasyarat tersebut; jangan memakai interpreter runtime aktif sebagai jalan pintas. Bootstrap hanya menyiapkan environment lokal dan dependency. Ia tidak memasang cron, plugin, token, database, atau akses Firebase.

Bootstrap memakai `requirements.lock` dengan dependency transitif dipin. `manage.py check` hanya memeriksa ketersediaan source, AST dan deteksi SDK; bukan tes. Seluruh fixture pengujian baru harus sintetis. Jalankan suite inti offline secara terpisah:

```bash
env -u HERMES_HOME PYTHONDONTWRITEBYTECODE=1 \
  .venv/bin/python -B -m unittest discover -s . -p 'test*.py'
```

Jalankan juga suite n8n/plugin secara terpisah sesuai [panduan pengembang](development.md). Hasil tes lokal tidak membuktikan kesiapan layanan eksternal. Simpan hasil aktual sesuai [status validasi](validation.md), tanpa menyalin angka historis dari instalasi lain.

## 2. Persiapkan konfigurasi privat tanpa mengaktifkan layanan

```bash
.venv/bin/python scripts/manage.py init-config \
  --output /absolute/private/budgetx-email-mesh/config.json
.venv/bin/python scripts/manage.py doctor \
  --config /absolute/private/budgetx-email-mesh/config.json
```

Template awal sengaja belum runnable. Isi field mengikuti [konfigurasi](configuration.md), tetap nonaktifkan seluruh flags. Pisahkan direktori source, state, backup, dan kredensial dari checkout. Source yang disertakan tidak menyalin runtime lama atau mengambil konfigurasi dari home operator.

## 3. Gate aktivasi operasional

Aktivasi memerlukan izin yang menyebut tindakan dan target. Selesaikan seluruh gate berikut sebelum pemanggilan worker operasional pertama:

1. **Inventaris instalasi.** Tentukan host, pemilik profil, interpreter, source revision, path konfigurasi aktif, database dan jadwal yang sudah ada. Jangan membuat publisher kedua atau runtime paralel dari checkout baru.
2. **OAuth Gmail read-only.** Siapkan OAuth Desktop client dan alur consent terpisah. Scope hanya `https://www.googleapis.com/auth/gmail.readonly`. Browser dan listener loopback harus berada pada host yang sama, atau memakai relay yang memang didukung dan disetujui. Gunakan state/PKCE dan listener berbatas waktu. Jangan meminta password, authorization code, callback URL, atau token lewat chat. Tidak ada perintah `mesh.py auth` pada source ini.
3. **Verifikasi mailbox.** Verifikasi scope yang diberikan, refresh token, dan hasil `users.getProfile` terhadap mailbox konfigurasi sebelum memasang token privat secara atomik (`0600`). Hindari mencetak email pribadi, response token, atau URL OAuth ke log publik. Mengganti token runtime yang publikasinya aktif dapat membuat jadwal lama kembali menulis uang; nyatakan konsekuensi itu sebelum reotorisasi.
4. **Verifikasi Firebase/IAM read-only.** Cocokkan project kredensial, project Firestore, hasil lookup Firebase Auth email/UID, dan path `users/{uid}`. Target source tetap demo terverifikasi. Terapkan least privilege IAM yang mencukupi operasi yang disetujui; Admin SDK tidak dibatasi Firestore Rules browser. Verifikasi akses baca dan identitas lebih dahulu, tanpa membuat data uji atau melakukan write sebagai smoke test.
5. **Persetujuan mapping dan waktu.** Baca ID wallet/kategori cloud aktual; konfirmasi kepemilikan endpoint, kartu/pocket yang relevan, tipe wallet, dan checkpoint aktivasi dengan timezone. Jangan memakai nama bank/pribadi atau kategori sebagai bukti kepemilikan. Jangan mengisi saldo pembuka dari email historis; basis posisi awal merupakan keputusan terpisah. Periksa komponen/outbox lama jika memakai state yang sudah ada.
6. **Rehearsal dan review.** Jalankan pengujian sintetis, review diff, dan siapkan backup online yang dapat dipulihkan. Bila memakai clone data privat yang disetujui, isolasi seluruh path mutable dan nonaktifkan publication, klasifikasi, review, web, dan notifikasi. Jangan menguji clone dengan kredensial publisher aktif.
7. **Persetujuan receipt dan publikasi.** Konfirmasi rekening bukan otomatis izin pencatatan. Untuk receipt tertahan, izin harus terikat receipt/revisi/target, arah dan delta wallet; satu persetujuan eksplisit yang mencakup asesmen dan pencatatan dapat memenuhi keduanya. Aktivasi fitur bukan persetujuan semua backlog atau replay historis.
8. **Satu scheduler.** Pilih Hermes cron atau n8n, bukan keduanya. Pasang watchdog terpisah yang tidak mengakuisisi atau memublikasikan transaksi. Plugin/rules/web memerlukan gate sendiri pada [otomasi](automation.md) dan [review web](web-review.md).

## 4. Helper otorisasi Gmail yang eksplisit

Setelah gate consent disetujui, jalankan helper dari terminal lokal tepercaya yang interaktif:

```bash
.venv/bin/python scripts/gmail_auth.py \
  --config /absolute/private/config.json --authorize
```

Helper merupakan alur loopback tersendiri; bukan `mesh.py auth`, collector, publisher atau installer jadwal. Browser harus mencapai listener pada host callback; tunnel SSH yang dikelola operator hanya dipakai bila memang didukung dan disetujui. Tidak ada code/URL callback/token lewat chat. Pengujian helper memakai callback/probe sintetis tanpa consent nyata; hasil offline tidak membuktikan token atau akses mailbox aktif. Periksa status implementasi/hasil helper pada revision yang dirilis sebelum pemakaian operasional.

## 5. Perintah worker yang tersedia

Berikut sintaks dari CLI source, **bukan langkah yang boleh dijalankan otomatis setelah clone**. Contoh ini memerlukan konfigurasi privat yang valid dan persetujuan operasional.

```bash
# Akses Gmail dan perubahan state lokal; tidak mengakses Firebase.
.venv/bin/python mesh.py --config /absolute/private/config.json --no-publish bootstrap
.venv/bin/python mesh.py --config /absolute/private/config.json --no-publish run

# Offline, tetapi tetap membuka Engine dan dapat membuat schema/checkpoint/cache lokal.
.venv/bin/python mesh.py --config /absolute/private/config.json status

# Dapat menerbitkan uang jika publish_enabled=true; bukan diagnosis/status.
.venv/bin/python ops.py --config /absolute/private/config.json run
```

`bootstrap` menyimpan cursor profil awal **sebelum** impor arsip yang mungkin panjang; arsip tetap bukti non-posting. Bootstrap ulang tidak mengganti cursor yang sudah ada. Jalankan delta segera sesudah bootstrap yang disetujui agar tidak membuka gap akuisisi. `--no-publish` mempertahankan outbox, bukan membuang kandidat. Jangan memakai `status` sebagai pemeriksaan forensik read-only; gunakan `doctor` atau SQLite `mode=ro` pada database yang sudah ada.

`ops.py` hanya menyediakan `run`, `watch`, dan `backup`; tidak ada subcommand `status`. CLI `backup` melewati watchdog dan dapat mengirim alert, sehingga memerlukan persetujuan seperti operasi lain. Lihat [runbook](operations.md).

## 6. Bukti setelah aktivasi yang disetujui

Amati jadwal yang sama, bukan memanggil publisher kedua untuk mencoba. Periksa output job terbaru, cursor/`last_success`, kandidat dan binding event, outbox, antrean review, serta acknowledgement notifikasi secara terpisah. Untuk setiap publikasi yang diklaim selesai, baca kembali marker kanonis, komponen deterministik, effect hash, dan delta wallet yang tepat. Zero delta/backlog tidak membuktikan semua template parser didukung; tidak ada receipt baru bukan kegagalan scheduler.

Jangan membuat transaksi/email sintetis pada produksi untuk membuktikan integrasi. Catat gate yang belum diuji dengan jujur. Deploy frontend, deploy rules, instalasi worker, aktivasi plugin, dan aktivasi jadwal adalah perubahan yang berbeda.
