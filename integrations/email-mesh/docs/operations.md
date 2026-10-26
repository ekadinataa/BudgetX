# Operasi dan pemulihan

## Prinsip operasi

Resolve instalasi aktif dari command scheduler dan argumen `--config` yang benar-benar digunakan, lalu baca `db_path` dan path auxiliary dari konfigurasi tersebut. Repo contoh, database bernama `mesh.db`, atau konfigurasi profile lain bukan bukti operasional. Pemeriksaan tidak mengizinkan impor, replay, rekonsiliasi, reset, manual publication, perubahan jadwal, atau perubahan saldo.

Pisahkan kesehatan scheduler, OAuth/akuisisi, cakupan parser, antrean review, klasifikasi, publikasi dan notifikasi. Job enabled dapat tetap gagal setiap tick. `code: 0` atau outbox kosong tidak membuktikan semua receipt didukung atau diterima browser.

## Observasi read-only

1. Periksa jadwal existing, pemilik profil, revision source/interpreter, waktu eksekusi terakhir dan output persisnya. Jangan menyalin command publisher ke terminal hanya untuk melihat status.
2. Baca `ops-run.json` dan `ops-alerts.json` privat dengan redaksi. `finished` adalah waktu wrapper selesai; `failures` menghitung kegagalan finansial berturut-turut. Nilai `outbox_pending: null` berarti counter tidak tersedia, bukan nol.
3. Buka database existing dengan SQLite URI `mode=ro` (opsional `PRAGMA query_only=ON`), tanpa `Engine.__enter__`. Inspeksi schema sebelum query. Gunakan transaksi baca untuk snapshot yang konsisten dan batasi query menurut scope/account.
4. Periksa `mailbox.last_success`, cursor, `job_runs`, kandidat/alasan/binding event, outbox, serta tabel review/worker/audit. Jangan mencetak raw email, ID receipt privat, alamat mailbox, account/card alias, provider stderr, request URI atau kredensial pada laporan publik.
5. Untuk klaim cloud tertentu, izin baca diperlukan dan target project/Auth harus diverifikasi dahulu. Baca hanya dokumen target persis. Jangan menulis sebagai tes.

`mesh.py ... status` tidak menyentuh jaringan, tetapi membuka Engine yang dapat membuat schema, checkpoint, registry/cache dan lock lokal. Ia **bukan** pemeriksaan forensik read-only. Gunakan `scripts/manage.py doctor --config ABS_PATH` untuk validasi lokal tanpa jaringan/penulisan, dan SQLite `mode=ro` untuk state runtime yang sudah ada.

## Counter yang perlu dibedakan

| Counter/status | Interpretasi yang benar |
| --- | --- |
| `outbox_pending` | Event belum berstatus sent; periksa attempts/deadline dan retry owner |
| `financial_review_pending` | Agregat review yang masih perlu penanganan, dapat mencakup approved/prepared/blocked |
| `financial_review_approved` | Keputusan lokal approved/prepared, belum tentu posted |
| `financial_review_posted` | Hasil processor pada tick itu, bukan total historis |
| `financial_review_error` | Error review/publikasi/notifikasi yang perlu dibaca terpisah |
| `category_corrections_pending` | Backlog kategori/tujuan, bukan karantina uang atau bukti approval |
| `category_transaction_updates: 0` | Bisa sudah cocok, belum approved, manual edit terlindungi, dokumen hilang, atau apply gagal |
| `web_error` | Error mirror/ingress pada payload hook; CLI keluar nonzero dan ops meneruskannya sebagai `financial_review_error` |
| Karantina nol | Definisi counter mengecualikan ready/archive/pre_checkpoint/not_transaction; bukan jaminan coverage |

Tidak ada delta baru/unchanged cursor sendiri bukan insiden. Notifikasi memakai acknowledgement provider dan audit; acknowledgement bukan bukti pesan sudah dibaca manusia. Crash setelah pengiriman tetapi sebelum acknowledgement lokal dapat mengulang notifikasi, bukan mengulang transaksi uang.

## Runbook OAuth refresh / `invalid_grant`

- `RefreshError` saja tidak membuktikan `invalid_grant`, pencabutan atau expiry. Error class sengaja disanitasi oleh worker.
- Jika diagnosis jaringan diizinkan, gunakan refresh **in-memory** yang terbatas timeout. Cetak hanya kode/error-description/subtype yang disanitasi, bukan token/header/URL. Jangan memakai `build_gmail` untuk probe read-only karena ia dapat menyimpan token hasil refresh.
- `invalid_grant` dengan pesan expired-or-revoked berarti penyebab keduanya belum terpisah. Status OAuth app Testing dapat terkait masa berlaku refresh token, tetapi jangan menyimpulkan tanpa memeriksa consent screen aktual.
- Recovery memerlukan persetujuan reotorisasi Gmail. Pertahankan scope `gmail.readonly`, mailbox, checkpoint/cursor dan evidence. Browser loopback harus mencapai listener di host callback; tidak ada code/token/callback URL lewat chat.
- Verifikasi profile/scope dan refresh token baru sebelum replacement atomik privat. Bila scheduler lama publication-enabled, token baru dapat membuatnya kembali menulis pada tick berikutnya; jelaskan konsekuensinya.
- Amati **jadwal existing** berikutnya dan readback state sebelum mengklaim pulih. Tidak perlu reset cursor atau manual publication.

Referensi resmi: [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## Runbook akuisisi HTTP 404

Pisahkan endpoint yang gagal:

- **Whole-message metadata/full 404:** pesan tidak tersedia. Source memiliki `MessageUnavailable`/`read_message` untuk boundary ini; audit `job_runs.detail.unavailable_messages` disimpan privat bersama commit cursor. Tidak membuat evidence atau transaksi palsu. Periksa source yang benar-benar terpasang sebelum menganggap penanganan ini aktif.
- **History cursor 404:** dapat memerlukan bounded recovery dengan overlap/high-water cursor; jangan menganggap pesan terhapus. Gap terlalu lama gagal tertutup.
- **Label/attachment 404, 401/403/429/5xx, timeout:** bukan deleted-message skip. Boundary harus mempertahankan kegagalan yang relevan agar tidak memajukan cursor melewati evidence rusak/hilang.

Diagnosis Gmail read-only perlu menelusuri **semua halaman** history sesuai worker, label dan metadata yang relevan. Satu request profile sukses tidak membuktikan delta selesai. Laporkan tahap/status/reason dan agregat, bukan message ID atau URI lengkap. Jangan reset/replay untuk melewati satu blocker.

## Runbook receipt hilang, template baru, dan karantina

1. Cari kandidat/event scoped, lalu retained evidence. Parser yang tidak mengenali template bisa memiliki `amount=null`; query nominal kosong tidak membuktikan email tidak diakuisisi.
2. Jalankan hanya parser pure atas evidence yang relevan pada rehearsal yang disetujui. Periksa sender/subject, label nominal/total, waktu, reference dan fee nullable. Jangan menjalankan wrapper finansial sebagai diagnosis.
3. Telusuri `candidates.event_id`, `event_evidence`, event/outbox dan marker cloud bila diizinkan. `ready` tanpa binding dapat tetap belum tercatat.
4. Bedakan receipt tidak didukung dari notifikasi nontransaksi. Template baru yang receipt-like sebaiknya `is_transaction=true`, ineligible/`unknown_template`, bukan disembunyikan sebagai promosi. Namun historis `not_transaction` **tidak** termasuk retry parser normal; memperbaiki parser belum memproses ulang data lama.
5. Buat regression sintetis RED/GREEN sebelum perubahan. Izin instalasi parser terpisah dari izin recovery receipt historis; satu permintaan eksplisit yang mencakup keduanya cukup untuk scope yang disebutkan.
6. Resolusi karantina uang harus terikat receipt/revisi/akun/arah/delta wallet. Konfirmasi endpoint dan kategori adalah gate berbeda. Satu persetujuan asesmen-dan-pencatatan yang lengkap cukup, jangan meminta duplikasi izin yang sama. Jangan memperluasnya menjadi alias umum atau replay massal.

ATM Krom tetap expense ke `EXTERNAL`, konfirmasi source membutuhkan kartu tersamarkan tepat. Tidak menambah wallet tunai atau menebak kategori. Biaya tidak disebut tetap null; tidak menambahkan komponen biaya supaya review bisa dikonfirmasi.

## Runbook kategori vs uang

Baca corrections JSON, worker `jobs`/`audit`, dan keputusan whitelist; satu store tidak membuktikan ketiganya sinkron. `deferred` dapat berupa error inferensi/format, `admin_pending` menunggu keputusan, `approved` masih memerlukan apply/readback. Gagal klasifikasi dapat terjadi ketika jalur finansial sukses.

Gunakan helper approval versi terpasang setelah keputusan admin eksplisit, bukan mengedit SQL/JSON atau mengubah status job saja. Lindungi kategori manual. Apply kategori harus scoped pada destination/event/komponen yang tepat dan mempertahankan tipe, amount, endpoint, movements, hold, marker dan checkpoint. `apply_destination_demo.py` memiliki dry-run default, tetapi tetap dapat mengakses cloud dan bukan validasi offline tanpa izin. `--apply` merupakan write metadata yang memerlukan persetujuan, walaupun tidak mengubah saldo.

Jangan menjadikan inferensi tentative sebagai approval agar counter nol. Dismissal antrean bukan keputusan kategori. Backoff/wait bukan kegagalan; memajukan deadline untuk retry perlu persetujuan dan audit, bukan memalsukan waktu.

## Runbook keputusan web diterima tetapi blocked

Baca command kanonis, revisi bukti, error aman dan binding event. Keputusan immutable yang sudah diterima tidak boleh dihapus/diganti dari browser, termasuk dengan reject. `webDecisionAccepted=true` dengan choices kosong adalah hasil yang benar walaupun state blocked. Gunakan recovery administrator receipt-specific dengan bukti terbaru; jangan browser retry, membuat ID baru, menghapus marker atau mengompensasi saldo. Lihat [kontrak web](web-review.md).

## Migrasi kredit, checkpoint, dan recovery scoped

`git pull` tidak mengizinkan migrasi. `migrate_credit.py` menyediakan logika plan tanpa mapping fasilitas bawaan (`FACILITIES` kosong). Entry point administratif `reconcile_demo_credit.py` memerlukan `--config ABS_PATH` dan `--facilities ABS_PRIVATE_JSON`; file fasilitas privat memuat mapping wallet yang telah diverifikasi/disetujui. Default plan/dry-run tetap membaca cloud dan memerlukan izin baca; `--apply` adalah perubahan posisi yang membutuhkan approval terpisah, backup dan exact readback. Jangan membuat mapping contoh dengan ID/saldo/fasilitas riil di Git atau memanggil utilitas ini sebagai smoke test.

`reset_checkpoint.py` adalah utilitas berisiko untuk reset/remap yang eksplisit, bukan recovery OAuth/parser atau proses upgrade normal. Mengubah checkpoint/registry dapat mengubah cakupan pencatatan; pause scheduler dan review basis posisi/mapping/cloud lebih dahulu.

Tidak ada skrip recovery incident dengan receipt/event ID privat yang dibawa sebagai prosedur publik. Untuk recovery receipt tertentu, susun rencana finite scoped pada data privat yang diizinkan: identitas receipt/revisi, bukti asli, mapping/arah/delta, status cloud marker/komponen, backup, dry rehearsal pada clone dan persetujuan tindakan. Gunakan ID kanonis yang sama, satu retry owner dan exact readback; jangan mengisi placeholder recovery dengan ID baru, replay semua receipt, menghapus marker atau mengubah saldo langsung.

## Backup yang dapat dipulihkan

Backup adalah operasi write privat yang perlu scope jelas. Gunakan **SQLite online backup API**, bukan copy satu berkas database yang masih terbuka. Lindungi direktori `0700`, berkas `0600`, manifest/checksum dan retensi sesuai kebijakan. Backup lokal bukan disaster recovery off-host.

Inventaris minimum:

- Ledger utama beserta cursor, evidence, candidate/event binding, checkpoint/registry, movements, holds dan seluruh outbox termasuk sent.
- Database destination whitelist dan database worker kategori, termasuk attempts/provenance/audit.
- Database review receipt termasuk commands/notices/audit dan backup preparation untuk event unresolved yang masih dibutuhkan recovery.
- Corrections/backlog JSON, snapshot config privat, revision source yang cocok, manifest checksum dan per-table content hash.
- Referensi raw archive/export eksternal dan source dependency; kelengkapan bundle tidak berarti file rujukan eksternal ikut tersalin.
- Strategi pemulihan kredensial terpisah yang aman. Backup ops mengecualikan isi token/client secret/Admin; jangan menyertakan secret dalam bundle yang akan diunggah ke repo/CI.

`ops.backup(...)` memakai online backup dan memverifikasi manifest/integrity untuk store yang didukung versi source. CLI `ops.py --config ABS_PATH backup` menjalankan jalur watchdog dengan forced backup dan **dapat mengirim alert**. `watch` juga menulis alert/backup state. Keduanya bukan pemeriksaan read-only. Daftar source dalam backup memakai allowlist versi source; tambahkan salinan/hash dependency yang belum tercakup (misalnya bridge/MIME/plugin) melalui proses backup yang disetujui, jangan menganggap bundle otomatis lengkap.

Untuk snapshot lintas-store konsisten, koordinasikan/pause seluruh writer dan lock yang sesuai selama pengambilan backup; online backup per database sendiri tidak menjamin satu timestamp atomik lintas-store. Verifikasi checksum, `PRAGMA integrity_check` dan snapshot ledger sebelum rotasi. Jangan memangkas preparation backup yang masih dibutuhkan event unresolved.

## Restore dan rollback

Restore memerlukan persetujuan eksplisit terhadap bundle, target dan konsekuensi. Prosedur:

1. Pause satu publisher scheduler dan writer/plugin terkait; hentikan watchdog sementara agar backup/alert tidak berlomba. Jangan menghentikan profil/gateway lain tanpa izin.
2. Buat pre-restore online backup yang dapat dipulihkan. Periksa checksum, manifest, seluruh integrity check dan kecocokan revision source/config.
3. Restore **terlebih dahulu ke direktori privat terpisah**. Petakan ulang semua path mutable: ledger, whitelist, worker, review, corrections, preparation backups dan output operasional. Nonaktifkan publication/klasifikasi/review/web/notifikasi dan jaringan.
4. Rehearse offline tanpa collector/publisher. Periksa cursor/checkpoint/event IDs/outbox/command/audit serta hash ledger sebelum/sesudah. Jangan mengarahkan clone ke auxiliary store aktif.
5. Sebelum replacement nyata, verifikasi project/Auth dan cloud checkpoint saat ini. Backup lokal yang lebih tua tidak mengembalikan cloud ke masa lalu. Pertahankan marker create-once; jangan restore saldo, hapus marker, atau mengganti event ID sebagai cara retry.
6. Pasang bundle yang disetujui secara atomik, pulihkan satu scheduler, lalu amati run existing dan exact readback event yang relevan. Mismatch registry/wallet/cloud memerlukan rekonsiliasi terpisah.

Rollback source mengikuti [proses rilis](development.md): pin revision yang diuji dan kompatibel dengan schema/state. `git pull` atau checkout revision tidak membatalkan migrasi, keputusan immutable atau efek cloud yang sudah commit. Jangan mengembalikan database lama hanya agar kode lama dapat dijalankan. Menonaktifkan flag menghentikan jalur tertentu, bukan rollback uang; prepared/approved yang sudah ada harus diperhitungkan sebelum resume.
