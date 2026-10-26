# Otomasi opsional

## Satu pemilik jadwal publisher

Gunakan **Hermes cron atau n8n**, tidak keduanya untuk target ledger yang sama. Keduanya harus menjalankan satu wrapper worker kanonis dengan path interpreter, working directory, config absolut dan profile eksplisit yang telah disetujui. Pertahankan lock aplikasi, non-overlap, timeout, backoff dan output tersanitasi. Jangan membuat scheduler baru untuk setiap hook: kategori/review merupakan bagian dari urutan job yang sama.

Artifact spesifik tersedia pada [panduan n8n](../n8n/README.md) dan [panduan plugin Hermes](../hermes-plugin/README.md); keduanya merinci API, environment tepercaya, guard dan tes adapter aktual.

Mengimpor workflow, memasang plugin atau checkout repo bukan aktivasi. Artifact harus nonaktif sampai gate [setup](setup.md) selesai. Jangan memasang otomatis saat bootstrap/check atau menyalin runtime credentials ke workflow export. Contoh jadwal bukan bukti jadwal terpasang.

## Wrapper dan template environment

`scripts/run-job.sh` membutuhkan `BUDGETX_MESH_CONFIG` berupa path absolut konfigurasi privat yang dapat dibaca. Ia memakai `.venv/bin/python` milik direktori integrasi dan menjalankan `ops.py ... run`; karena itu wrapper dapat memublikasikan uang sesuai flags/approval, bukan command status. Ia tidak membuat atau mengaktifkan scheduler.

`automation/runtime.env.example` adalah template environment tepercaya. Salinan terisi disimpan di luar Git dengan mode `0600`. Template `automation/systemd/budgetx-mesh-watch.service` dan `.timer` memiliki placeholder path yang wajib ditinjau/diganti sebelum pemasangan yang disetujui. Service watchdog memakai `ops.py watch`, bukan publisher; pemasangan unit, enable/linger dan perubahan service tidak dijalankan bootstrap. Jangan mengganti placeholder dengan path source aktif yang belum diuji.

## Hermes cron

Bila memilih Hermes, job harus dimiliki profile yang tepat dengan source/interpreter/config absolut. Tinjau job existing sebelum membuat/mengubahnya. Jangan menjalankan job manual sebagai pemeriksaan status karena wrapper dapat memublikasikan uang. Pemilihan profile bukan IAM sandbox; seluruh otorisasi target tetap berlaku.

Untuk fitur kategori, `HERMES_HOME` harus direktori absolut profile yang sudah memiliki `config.yaml`, sama untuk classifier/notifier/env/cwd. Classifier tidak menerima tools/MCP atau otorisasi saldo; label tujuan yang sudah direduksi hanya dipakai usulan kategori. Tidak ada fallback ke default profile.

Sintaks/opsi Hermes harus mengikuti versi yang benar-benar terpasang dan [dokumentasi Hermes resmi](https://hermes-agent.nousresearch.com/docs/), bukan command dari incident lama. Tidak ada instruksi di sini untuk membuat cron secara otomatis atau memindahkan job milik profile lain.

## n8n

n8n hanya pengorkestrasi **worker yang sama**, bukan implementasi parser/saldo di node JavaScript. Jika artifact workflow disertakan, impor sebagai inactive dan tinjau semua node/command sebelum activation. Sesuaikan interpreter/checkout/config absolut pada host worker yang benar; path di container n8n tidak otomatis berarti path host tersedia.

Persyaratan deployment:

- Pilih mekanisme eksekusi lokal/remote yang tersedia dan disetujui pada instalasi n8n; node command lokal tidak selalu diizinkan pada setiap deployment. Jangan membuka shell/HTTP publisher baru untuk melewati kebijakan platform.
- Kredensial melalui credential store/secret mount privat. Jangan menanam OAuth token/Admin key, mailbox, receipt body atau private config JSON dalam workflow export/execution data.
- Cegah eksekusi overlap dan batasi timeout. Lock ledger tetap menjadi lapisan pertahanan, bukan alasan mengaktifkan dua scheduler.
- Simpan hanya exit/status/counter yang tersanitasi; minimalkan retensi execution data dan akses operator. Error message SDK mentah dapat mengandung identitas/token/request URI.
- Jangan membuat loop `retry all`, reset cursor, memajukan deadline atau mengulang event ID baru sebagai error recovery. Worker mengelola outbox/retry finansial sendiri.
- Sebelum mengaktifkan n8n, nonaktifkan publisher scheduler lama melalui change yang disetujui; verifikasi hanya satu pemilik aktif setelah cutover. Siapkan rencana rollback scheduler tanpa duplikasi publish.

Gate n8n end-to-end memerlukan readback jadwal/eksekusi pada instalasi aktual. Validasi JSON offline saja tidak membuktikan node tersedia, permission shell/SSH, mount, IAM atau keberhasilan run.

Adapter n8n yang disertakan default `preview`, tanpa membaca config/state runtime. `inspect` hanya untuk status/verifikasi read-only; `live` memerlukan izin operator, mode `live`, `BUDGETX_N8N_ALLOW_LIVE=1`, profile `HERMES_HOME` valid, dan bukti scheduler lama nonaktif menurut guard adapter. Pipeline/classification/review memeriksa semua job bernama `budgetx-email-mesh-demo` pada profile terpilih disabled; watchdog/backup memerlukan timer lama inactive **dan** disabled. Missing/ambiguity gagal tertutup; adapter tidak mematikan scheduler sendiri. Review adapter memakai `--notify-only`, tetapi tetap dapat mengingest keputusan/mirror bila web aktif. Lihat kontrak lengkap, konfigurasi `BUDGETX_MESH_ROOT`, batas deployment self-hosted Execute Command, dan checklist cutover pada [README n8n](../n8n/README.md).

## Plugin review Hermes

Plugin opsional meneruskan perintah administrator ke handler kanonis. Ia bukan publisher tambahan. Handler menulis keputusan receipt/revisi dan audit lokal; job existing berikutnya melakukan validasi dan publikasi yang diizinkan.

Kontrak perintah administrator:

```text
/bxreview
/bxconfirm ID REVISI transfer SUMBER TUJUAN
/bxconfirm ID REVISI expense SUMBER
/bxconfirm ID REVISI income TUJUAN
/bxretry ID REVISI
/bxreject ID REVISI
```

`ID`/`REVISI` berasal dari notifikasi kanonis, key wallet dari registry terverifikasi. Aktor harus berasal dari metadata DM Telegram yang tepercaya, bukan body chat atau identitas buatan. Source membatasi administrator; mengaktifkan plugin bukan izin menambah administrator lain. `retry` administrator masih menjalankan gate finansial dan dapat mengizinkan pencatatan, bukan sekadar refresh UI. Web retry tetap dilarang.

Satu konfirmasi lengkap dapat mencakup asesmen endpoint dan izin pencatatan receipt tersebut; tidak membuat alias global, approval kategori, atau izin replay receipt lain. Dukungan kategori/note receipt-specific harus diverifikasi terhadap API versi terpasang; jangan menjanjikan field yang akan diabaikan.

Plugin yang disertakan membutuhkan environment operator-owned `HERMES_HOME`, `BUDGETX_MESH_ROOT`, `BUDGETX_MESH_CONFIG`, dan `BUDGETX_MESH_PYTHON` berupa path absolut yang valid. Role profile dibatasi `profiles/devops-budgetx`; administrator tetap konstanta source, bukan authority dari payload chat. Registration memakai native `ctx.register_telegram_handler(factory)` dengan blocking interceptor sebelum busy-session; kontrak rinci dan batas validasi actor tersedia pada [README plugin](../hermes-plugin/README.md).

Instal hanya pada profile pemilik yang disetujui; jangan mengedit plugin/config profile lain. Tinjau manifest/dependency/plugin API versi Hermes yang digunakan dan uji synthetic dispatch, termasuk ketika session busy, sebelum aktivasi. Reserved command yang ditolak tidak boleh lolos ke LLM. Reconnect/restart gateway bersama memerlukan izin terpisah karena memengaruhi profile lain; jangan merutekan restart melalui scheduler untuk melewati guard. Setelah restart yang disetujui, verifikasi readiness sesuai PID/start baru dan observasi jadwal existing. Tidak ada instalasi/restart yang dilakukan oleh panduan ini.

## Watchdog bukan failover publisher

Watchdog boleh memiliki timer systemd independen agar scheduler utama yang mati tetap terdeteksi. Ia tidak boleh memanggil delta/publisher atau mengaktifkan scheduler cadangan. Periksa run/Gmail staleness, failure streak, outbox, quarantine, review/notification error, disk dan backup age menurut implementasi source yang dirilis.

`ops.py watch` tidak menerbitkan uang, tetapi dapat menulis alert state, mengirim notifikasi dan membuat backup. `ops.py backup` melewati jalur watchdog dengan forced backup dan dapat mengirim alert juga. Keduanya bukan dry-run/read-only. Hermes executable di-resolve dari instalasi/PATH, profile dipilih secara eksplisit, dan routing alert watchdog memerlukan `ops_alert_target` pada konfigurasi privat (default template null). Audit environment/routing sebelum pemakaian. Pemeriksaan service gateway pada watchdog masih mengacu pada `hermes-gateway.service`; jangan menganggap indikator itu berlaku pada semua deployment n8n.

Untuk n8n, indikator kesehatan scheduler tidak otomatis sama dengan pemeriksaan service Hermes gateway pada source watchdog. Adaptasi watchdog perlu review/test tersendiri. Backup dapat bergantung pada writer/lock auxiliary; rujuk [operasi](operations.md) sebelum menjadwalkannya.
