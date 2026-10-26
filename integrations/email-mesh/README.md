# BudgetX Email Mesh

Integrasi Email Mesh merupakan bagian dari repositori BudgetX. Worker Python mengubah notifikasi transaksi Gmail menjadi bukti lokal, kandidat transaksi, dan event keuangan kanonis. Publikasi memakai Firebase Admin SDK ke skema transaksi BudgetX yang sudah ada; tidak menambah server HTTP atau mengganti layanan transaksi frontend.

Source worker, parser, ekstraksi MIME, antrean review, dan pengujian disertakan agar pengembangan tidak bergantung pada direktori kerja pribadi. Konfigurasi, kredensial, email, dan database operasional **tidak** disertakan. Snapshot source ini tidak memigrasikan instalasi, konfigurasi, state, plugin, atau jadwal yang sudah berjalan. `git pull` memperbarui source, bukan persetujuan aktivasi atau publikasi uang.

## Mulai pengembangan

Prasyarat: Python 3.11+, SQLite dengan dukungan standar Python, dan lingkungan POSIX untuk `fcntl.flock` (Linux direkomendasikan; Windows melalui WSL). Bootstrap memerlukan akses paket; pengujian offline tidak memerlukan Gmail, Firebase, Hermes, atau konfigurasi privat.

Dari root repositori:

```bash
cd integrations/email-mesh
./scripts/bootstrap.sh
.venv/bin/python scripts/manage.py check
```

Bootstrap menyiapkan `.venv` melalui `uv`, atau `python -m venv` dan pip bila `uv` tidak tersedia, menggunakan dependency transitif yang dipin pada `requirements.lock`. `check` hanya memeriksa ketersediaan source, parsing AST dan deteksi SDK tanpa memerlukan konfigurasi privat; **bukan menjalankan suite tes**. Jalankan suite sintetis secara terpisah:

```bash
env -u HERMES_HOME .venv/bin/python -B -m unittest discover -s . -p 'test*.py'
```

Tes n8n dan plugin dijalankan terpisah sesuai [panduan pengembang](docs/development.md). Tidak ada akses mailbox atau database aktif pada tes ini.

Untuk membuat template privat tanpa aktivasi:

```bash
.venv/bin/python scripts/manage.py init-config \
  --output /absolute/private/budgetx-email-mesh/config.json
.venv/bin/python scripts/manage.py doctor \
  --config /absolute/private/budgetx-email-mesh/config.json
```

Ganti `/absolute/private/...` dengan lokasi absolut di luar checkout. `init-config` tidak meminta OAuth, mengisi checkpoint riil, menerbitkan transaksi, atau memasang jadwal. Template belum siap operasional sampai placeholder diganti melalui prosedur aktivasi. `doctor` adalah validasi lokal read-only, tanpa jaringan atau perubahan state; penolakan template yang belum diisi adalah hasil yang diharapkan, bukan alasan melonggarkan guard.

## Batas keselamatan

- Publikasi, klasifikasi tujuan, notifikasi review, dan web review nonaktif pada konfigurasi contoh.
- Worker dibatasi pada project `budgetku-app-v1`, Auth `demo@budgetx.id`, UID `VCqdnx9zvJVrZQSNp6gyGm6Zzhr2`, dan akun kolektor `akun-1`. Ini batas implementasi, bukan dukungan arbitrary-user atau izin menulis ke target tersebut.
- Gmail memakai `gmail.readonly`. Admin SDK memakai IAM dan melewati Firestore Rules frontend; verifikasi project/Auth wajib sebelum operasi cloud.
- Bukti bukan transaksi; kandidat `ready`, keputusan diterima, dan status `posted` adalah tahap yang berbeda. Hanya readback marker/komponen kanonis dapat mendukung klaim publikasi.
- Nominal IDR berupa integer. Biaya yang tidak disebut tetap `null`, bukan dianggap nol. Kepemilikan rekening dan kategori merupakan keputusan terpisah.
- Penarikan ATM Krom dicatat sebagai expense ke `EXTERNAL` dari wallet bank yang kepemilikan kartunya dikonfirmasi; tidak membuat wallet tunai atau menebak kategori.
- Satu pemilik jadwal publisher: Hermes cron **atau** n8n. Watchdog bukan publisher cadangan.

## Dokumentasi

| Dokumen | Isi |
| --- | --- |
| [Setup dan aktivasi](docs/setup.md) | Instalasi bersih, OAuth, Admin IAM, checkpoint, dan persetujuan operasional |
| [Konfigurasi](docs/configuration.md) | Placeholder, path privat, flags, registry, dan batas kompatibilitas |
| [Arsitektur dan data](docs/architecture.md) | Aliran bukti, skema, state machine, deduplikasi, dan semantik uang |
| [Review web](docs/web-review.md) | Kontrak mirror/decision immutable, keamanan rules, dan aktivasi terpisah |
| [Operasi dan pemulihan](docs/operations.md) | Kesehatan, diagnosis, backup, restore, dan rollback |
| [Pengembangan](docs/development.md) | Peta file, pengujian sintetis, CI, profil Hermes, dan pembaruan source |
| [Otomasi opsional](docs/automation.md) | Satu scheduler, [adapter n8n](n8n/README.md), [plugin Hermes](hermes-plugin/README.md), dan watchdog |
| [Status validasi](docs/validation.md) | Evidence rilis dan batas hasil pengujian |

[config.example.json](config.example.json) adalah template fail-closed, bukan salinan konfigurasi runtime. Jangan menambahkan email pribadi, identitas rekening/kartu, saldo riil, checkpoint aktif, token, atau arsip receipt ke Git. Panduan ini tidak menyatakan bahwa worker, plugin, rules, jadwal, atau data cloud sudah diaktifkan atau diverifikasi pada instalasi mana pun.
