# Konfigurasi privat

## Template bukan runtime

`config.example.json` sengaja tidak dapat langsung dijalankan: mailbox dan sender memakai domain `example.invalid`, checkpoint berupa `CHECKPOINT_REQUIRED`, path serta wallet ID masih placeholder, alias kosong, dan semua fitur opsional nonaktif. Tidak ada saldo pembuka riil atau identitas rekening/kartu di template.

Buat berkas privat memakai `scripts/manage.py init-config --output ABS_PATH`. Simpan di luar checkout, direktori `0700`, berkas konfigurasi/token/Admin `0600`. Gunakan path absolut, bukan `~`, path relatif, atau path profile lain. Jangan memasukkan isi kredensial ke JSON konfigurasi; yang disimpan hanya path menuju berkas privat.

| Placeholder | Penggantian saat persiapan yang disetujui |
| --- | --- |
| `__STATE_DIR__` | Direktori absolut privat untuk state, kredensial, dan referensi arsip |
| `__SOURCE_DIR__` | Direktori absolut source integrasi yang berisi `harvest.py` |
| `__REPLACE_WALLET_ID_KROM__` | ID dokumen wallet yang benar-benar ada pada target terverifikasi |
| `CHECKPOINT_REQUIRED` | Waktu aktivasi yang disetujui, ISO 8601 dengan offset/timezone |
| `mailbox@example.invalid` | Mailbox Gmail yang memang diotorisasi |
| `alerts@example.invalid` | Sender provider persis yang disetujui untuk akuisisi |

`init-config` mengganti `__STATE_DIR__` dengan direktori privat output dan `__SOURCE_DIR__` dengan path source integrasi. Placeholder lain tetap menunggu keputusan operator. Placeholder adalah notasi dokumentasi, **bukan** ekspansi environment oleh `mesh.py`. Path dalam berkas contoh seperti `__STATE_DIR__/state.sqlite3` belum absolut sebelum diganti. Jangan mengganti checkpoint dengan tanggal contoh supaya validasi lolos. Registry contoh memperlihatkan bentuk satu wallet, bukan pernyataan bahwa wallet tersebut ada atau dimiliki operator.

## Target yang dibatasi source

| Field | Nilai yang diterima implementasi |
| --- | --- |
| `project_id` | `budgetku-app-v1` |
| `email` | `demo@budgetx.id` |
| `uid` | `VCqdnx9zvJVrZQSNp6gyGm6Zzhr2` |
| `account_id` | `akun-1` |
| `financial_review_admin_chat_id` | `790484718`, string; hanya relevan bila review diaktifkan |
| `financial_review_admin_user_ids` | `["790484718"]`; scope administrator yang diverifikasi source |

Nilai ini merupakan kontrak kompatibilitas yang hardcoded, bukan parameter tenant umum. Mengganti ID atau menghapus guard agar akun lain lolos memerlukan desain dan review keamanan baru. Nama akun kolektor tidak sama dengan alamat mailbox atau identitas Auth BudgetX. Batas demo tidak mengizinkan publikasi tanpa persetujuan tindakan dan target.

## Kelompok field

### Akuisisi dan penyimpanan

- `db_path`: ledger SQLite utama. Jangan arahkan ke berkas contoh `mesh.db` atau database profil lain.
- `token_path`: authorized-user token Gmail; `client_secret_path`: metadata lokasi OAuth Desktop client. `mesh.py` tidak menjalankan consent interaktif. Helper terpisah `scripts/gmail_auth.py` memerlukan `--config ABS_PATH --authorize` untuk consent yang disetujui; ia tidak mengaktifkan publisher/jadwal.
- `firebase_admin_path`: kredensial Admin privat. Proyek pada kredensial harus sama dengan target; jangan menaruhnya pada `public/`, frontend env, atau bundle browser.
- `archive_path` dan `raw_archive_dir`: arsip privat opsional dan referensi raw evidence. Impor archive bersifat non-posting, bukan rekonstruksi saldo pembuka.
- `harvest_dir`: source-only import path untuk ekstraksi MIME. Template/init-config mengarahkannya eksplisit ke source integrasi; bila tidak diisi, source integrasi memakai `harvest.py` di sebelah `mesh.py`. Override eksplisit yang hilang gagal, bukan fallback ke workspace pribadi.
- `ops_alert_target`: routing notifikasi watchdog dari konfigurasi operator, default template `null` agar tidak mengirim ke penerima implisit. Isi hanya setelah channel/target disetujui; ini berbeda dari konstanta administrator review receipt.
- `sender_allowlist`: alamat sender **persis** ke kode provider, bukan display name/domain wildcard. Daftar harus sesuai parser dan scope yang disetujui. Sender yang diizinkan akuisisi belum tentu memiliki template yang didukung parser. Implementasi mengecualikan sender Shopee; jangan memperluasnya diam-diam.
- `recovery_overlap_seconds`: overlap pemulihan cursor, default source 300 detik.
- `recovery_max_days`: batas gap pemulihan, default source 7 hari. Ini bukan izin replay tanpa batas.

### Registry, waktu, dan klasifikasi

- `checkpoint_at`: batas awal pencatatan dengan timezone; receipt sebelum checkpoint tetap menjadi bukti, tidak dipublikasikan. Tanggal komponen memakai waktu notifikasi yang dikonversi ke `Asia/Jakarta`, bukan waktu body yang ditebak.
- `registry.wallets`: key parser ke ID dokumen wallet dan tipe wallet. ID unik, tidak kosong, tanpa `/`. Daftarkan hanya wallet terverifikasi; worker tidak membuat wallet yang hilang.
- `registry.aliases`: identitas endpoint yang sudah dikonfirmasi ke key wallet. Biarkan kosong sampai ada persetujuan kepemilikan. Nama orang/bank saja tidak membuktikan kepemilikan.
- `registry.reporter_aliases`: pemetaan pocket yang spesifik provider, bila parser membutuhkannya. Alias pocket generik tidak boleh dipakai lintas provider.
- `owner_names`: daftar konfirmasi untuk rekonsiliasi bukti incoming yang terbatas, bukan whitelist kepemilikan atau izin income.
- `categories`: cache katalog kategori; `category_overrides`, `destination_category_overrides`, dan `destination_tag_overrides`: keputusan klasifikasi eksplisit. Kosong adalah default aman. Kategori tidak boleh mengubah tipe, endpoint, saldo, atau hold.

Checkpoint dan registry dipertahankan pada ledger; perubahan in-place ditolak bila berbeda dari basis yang tersimpan. Perubahan wallet/alias/checkpoint memerlukan rekonsiliasi terpisah yang disetujui, bukan menghapus database atau marker untuk melewati guard. Mapping kategori per kartu tidak boleh diperluas ke semua kartu/produk.

### Fitur opsional

| Field | Default template | Arti |
| --- | --- | --- |
| `publish_enabled` | `false` | Izin konfigurasi untuk publisher; masih tunduk validasi dan persetujuan |
| `destination_classification_enabled` | `false` | Hook klasifikasi tujuan setelah delta berhasil |
| `destination_classification_notify_admin` | `false` | Notifikasi klasifikasi yang dapat memanggil Hermes |
| `financial_review_enabled` | `false` | Antrean review receipt dan notifikasi administrator |
| `financial_review_web_enabled` | `false` | Mirror/ingress keputusan web; membutuhkan review utama |

Opt-in memakai boolean JSON `true` yang persis, bukan string `"true"` atau angka. `--no-publish` pada `mesh.py` menonaktifkan akses Firebase untuk perintah itu, tidak menonaktifkan semua worker lain. `financial_review_hook.py --notify-only` tetap dapat menulis antrean/notifikasi dan, jika web diaktifkan, mirror/ingress cloud; itu bukan mode read-only.

`destination_whitelist_path`, `category_worker_state_path`, dan `financial_review_state_path` menunjuk database auxiliary **terpisah**. Bila path worker kategori tidak diisi, source memakai suffix `.category-worker.sqlite3` pada path whitelist. Review menolak symlink/alias file dan collision dengan path database/kredensial lain. Semua path mutable harus dipetakan ulang saat rehearsal pada clone.

## Validasi

```bash
.venv/bin/python scripts/manage.py doctor \
  --config /absolute/private/budgetx-email-mesh/config.json
```

`doctor` tidak membuktikan refresh OAuth, kepemilikan mailbox, IAM, kondisi cloud, atau keberhasilan scheduler: ia sengaja tanpa jaringan dan tanpa penulisan state. Pemeriksaan tersebut merupakan gate aktivasi terpisah pada [setup](setup.md).
