# Panduan pengembang

## Batas source dan runtime

`integrations/email-mesh` adalah source BudgetX yang dapat direview dan diuji dari checkout. Direktori worker terpisah pada mesin lama hanya referensi snapshot, bukan dependency wajib atau sumber kebenaran otomatis. Tidak ada sinkronisasi dua arah, auto-update runtime, migrasi state/config atau aktivasi jadwal saat `git pull`.

Jangan membaca token, mailbox, database atau corpus privat untuk menjalankan tes. Tidak ada secret/receipt nyata yang dibutuhkan CI. Hasil historis dari workspace lain tidak berlaku untuk revision ini.

## Peta file

| File/kelompok | Tanggung jawab |
| --- | --- |
| `mesh.py` | Validasi config/target, ledger SQLite, cursor Gmail, dedup event, outbox dan publisher atomik |
| `mesh_parser.py` | Parser pure dan validasi fakta finansial per template |
| `harvest.py` | Ekstraksi MIME dan normalisasi body plain/HTML |
| `reconciliation.py` | Pencocokan evidence incoming konservatif; bukan publisher kedua |
| `category_rules.py` | Resolusi kategori dari bukti/katalog yang kompatibel |
| `destination_whitelist.py` | Whitelist kategori/tag, observasi dan antrean tujuan |
| `category_worker.py`, `category_hook.py` | Inferensi/approval/notification kategori dan correction-only hook |
| `apply_destination_demo.py` | Rencana/apply metadata kategori dengan perlindungan edit manual |
| `financial_review.py` | Discovery receipt, commands/audit/notices dan trust gate Telegram |
| `financial_review_apply.py` | Validasi ulang, preparation backup, satu retry owner dan readback finansial |
| `financial_review_hook.py` | Adapter ke job existing, lock, discovery, processor dan notifier |
| `financial_review_web.py` | Mirror allowlist, immutable decision web dan adapter hook |
| `financial_review_admin.py` | Handler perintah administrator terikat receipt/revisi |
| `ops.py` | Wrapper run, agregat kesehatan, watchdog dan backup |
| `migrate_credit.py`, `reconcile_demo_credit.py`, `reset_checkpoint.py` | Logika/utilitas administratif berisiko; bukan bootstrap, replay historis atau smoke produksi. Mapping fasilitas privat eksplisit diperlukan untuk migrasi kredit |
| `scripts/bootstrap.sh`, `requirements.lock`, `scripts/manage.py` | Environment lokal dengan dependency dipin, AST/source/SDK check, template privat dan doctor read-only |
| `scripts/gmail_auth.py` | Helper OAuth loopback guarded; consent hanya dengan `--authorize`, bukan aktivasi publisher |
| `scripts/run-job.sh`, `automation/` | Wrapper eksplisit dan template watchdog/env, tanpa instalasi scheduler otomatis |
| `test_*.py` | Unit/regression/integration offline dengan fixture sintetis |
| `config.example.json`, `docs/` | Template aman dan kontrak yang harus ikut diperbarui |

Adapter n8n/plugin bersifat opsional. Kontrak aktual tersedia pada [n8n](../n8n/README.md), [plugin Hermes](../hermes-plugin/README.md), dan [otomasi](automation.md); jangan menyalin plugin ke profile aktif selama pengujian.

## Menjalankan tes

Dari root repo:

```bash
cd integrations/email-mesh
./scripts/bootstrap.sh
.venv/bin/python scripts/manage.py check
```

`manage.py check` **tidak menjalankan tes**: ia hanya memeriksa source/AST dan deteksi SDK. Bootstrap memasang dependency dari lockfile transitif `requirements.lock`; perubahan dependency harus menghasilkan pembaruan lockfile yang direview.

Suite Python langsung, tanpa profile runtime:

```bash
env -u HERMES_HOME PYTHONDONTWRITEBYTECODE=1 \
  .venv/bin/python -B -m unittest discover -s . -p 'test*.py'

# Contoh regresi terfokus, seluruh data sintetis.
env -u HERMES_HOME .venv/bin/python -B -m unittest -v \
  test_krom_atm test_superbank_qris test_message_unavailable test_financial_review_web
```

Suite n8n dan plugin berada pada direktori terpisah dan **tidak tercakup** oleh discovery top-level di atas. Dari direktori integrasi:

```bash
env -u HERMES_HOME .venv/bin/python -B -m unittest discover -s n8n -p 'test*.py'
env -u HERMES_HOME .venv/bin/python -B -m unittest discover -s hermes-plugin -p 'test*.py'
```

Python 3.11+ diperlukan; lock engine memakai `fcntl`, jadi CI Python menggunakan Linux/POSIX. Dependency cloud dipasang bootstrap untuk penggunaan operasional; tes tidak boleh mengontak cloud meskipun SDK terpasang. Simpan database/fixture temporer di direktori tes (`TemporaryDirectory`, mengikuti `TMPDIR`), bukan di runtime config atau root repo. Jangan menambahkan absolute path workstation, dataset privat, saldo/account/card alias riil atau expectation berdasarkan ledger pribadi ke regression baru.

Untuk perubahan kontrak frontend/web rules, jalankan test helper/rules dan gate frontend yang relevan dari root BudgetX sesuai `package.json` dan panduan repo. Source-contract test rules bukan Firestore Rules emulator; catat bila emulator/browser tidak dijalankan. Integrasi backend ini tidak otomatis mengaktifkan Firebase Hosting, rules atau kredensial frontend.

## Profile Hermes pada fitur kategori/plugin

Core parser/ledger/test tidak memerlukan Hermes. Untuk fitur classifier/notifier yang memang diaktifkan, `HERMES_HOME` harus menunjuk path absolut **profile yang sudah dikonfigurasi**, berisi `config.yaml`. Classifier dan notifier harus mewarisi env dan cwd profile yang sama. Gagal tertutup jika selection hilang/invalid; tidak membuat profile baru, menyalin credential, atau fallback ke default.

Protocol test membuat profile sementara sintetis dan memalsukan subprocess, bukan menggunakan profile operator. Jalankan suite penuh dengan `HERMES_HOME` unset untuk membuktikan isolasi ini. Pemanggilan live Hermes memerlukan izin terpisah dan dapat mengirim konteks label tujuan yang sudah direduksi; bukan bagian check/CI.

Jangan mengedit config/plugin/cron profile lain hanya karena satu gateway melayani banyak profile. Reconnect/restart gateway bersama merupakan operasi terpisah yang dapat mengganggu pengguna lain. Referensi Hermes terbaru: [dokumentasi resmi](https://hermes-agent.nousresearch.com/docs/).

## Menambah atau memperbaiki parser: RED → GREEN

1. Definisikan template scope sender/subject/body dan fakta yang harus dipastikan. Pisahkan receipt-like unsupported dari promosi/statement/verification. Jangan menganggap label nominal sederhana mewakili semua variasi template.
2. Tulis fixture **sintetis** dan satu regression gagal untuk perilaku yang benar. Tidak menyalin body/receipt ID/provider email pribadi atau identitas kartu dari incident. Pastikan tes mengimpor `mesh_parser.py` di checkout ini, bukan modul dari direktori worker lama.
3. Jalankan RED dan pastikan gagal karena perilaku yang hilang, bukan dependency/path/fixture salah. Tambahkan implementasi terkecil, lalu GREEN.
4. Perluas matrix negatif: sender lookalike/multiple sender, subject unsupported, field duplikat/hilang, angka footer, IDR malformed/fraction/bool, total kontradiktif, fee absent/displayed/paid/waived, status failed/pending/reversal, waktu missing/invalid, alias ambigu atau scope kartu/provider salah.
5. Uji pure parser tidak mengubah input/registry, lalu jalur Engine/SQLite sintetis: evidence utuh, satu event/movement, tidak ada efek pada invalid case, duplicate message/reference/restart no-op, binding dan checkpoint tetap benar. Tambahkan fake publisher transaction/readback bila menyentuh publikasi.
6. Jalankan targeted suite dan full suite; periksa diff keamanan. Reparse historis, perubahan ownership dan rollout runtime **bukan** efek otomatis patch parser.

Pengujian untuk perubahan publisher wajib melindungi create-once marker, deterministic component IDs, effect hash, Increment atomik, crash-after-commit, category-only/manual edit, hold linkage, review retry ownership, namespace/Auth mismatch dan recovery yang fail-closed. Perubahan bridge harus menjaga kontrak immutable/nullable/redaksi di [review web](web-review.md).

## CI dan evidence

CI harus dapat berjalan tanpa private config, kredensial, corpus, runtime database, Hermes profile aktif atau koneksi Gmail/Firebase. Pisahkan instalasi dependency (mungkin memerlukan jaringan) dari eksekusi test offline. Gunakan service mocks/fake SDK dan fixture sintetis, jangan membuat transaksi cloud sementara sebagai test integration.

Catat command, revision, Python/OS, hasil suite, warning/skip dan batas coverage pada [status validasi](validation.md). Jangan menulis angka jumlah tes dari ingatan atau hasil child suite sebagai bukti full suite. Check lokal/CI tidak membuktikan instalasi runtime atau scheduled publication.

## Mengadopsi pembaruan source dan merilis

1. Identifikasi source revision yang diuji dan runtime revision yang benar-benar dijalankan scheduler. Periksa perubahan schema/protocol, flags, interpreter dependency, profile dan auxiliary stores. Hindari asumsi working tree sama dengan commit.
2. Adopsi perubahan upstream lewat diff source yang terbatas. Jangan menyalin README historis, config privat, credential, arsip, database, venv, log incident atau schedule aktif ke repo. Source snapshot baru tidak otomatis menjadi instalasi produksi.
3. Reproduksi masalah dengan regression sintetis RED/GREEN, jalankan full check, review independen, dan review diff/security. Jangan menginstal kode setengah jadi pada path yang diimpor setiap tick.
4. Setelah persetujuan rollout target, ambil online backup lengkap dan baseline event/marker/checkpoint/hash payload outbox. Pause writer pada cutover, cek tidak ada perubahan source bersamaan, dan pasang artifact teruji secara atomik atau pin path revision immutable. Jangan menyisipkan `git pull` ke cron/n8n.
5. Pertahankan path state/credential/flags kecuali migrasi spesifik memang diizinkan. Perubahan registry/checkpoint/ID wallet atau schema memerlukan rencana kompatibilitas dan approval terpisah, bukan database baru untuk menghindari guard.
6. Verifikasi bytes/revision terpasang sama dengan artifact teruji. Amati **jadwal existing** berikutnya dan exact readback; tidak memanggil publisher kedua atau mengirim receipt sintetis ke produksi.
7. Rollback hanya ke revision yang kompatibel. Keputusan immutable dan efek cloud yang sudah commit tetap berlaku. Jika state/schema baru tidak kompatibel, pause dan lakukan recovery yang direview; `git checkout` sendiri bukan rollback data.

Untuk rilis repo, sertakan perubahan docs/config/tests bersamaan dengan source. Push/merge, instalasi runtime, deploy frontend/rules, aktivasi plugin dan jadwal adalah gate yang berbeda; laporkan masing-masing, termasuk yang tidak dilakukan.
