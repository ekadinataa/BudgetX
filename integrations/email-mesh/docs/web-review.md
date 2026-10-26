# Kontrak review web

Modul `financial_review_web.py` menghubungkan antrean review SQLite dengan UI BudgetX. Source disertakan di repo; itu **bukan** bukti bahwa worker, rules, frontend, konfigurasi atau scheduler instalasi tertentu telah diaktifkan. Pengiriman keputusan di browser bukan bukti uang telah diposting.

## Tanggung jawab dan batas kepercayaan

- `WebReviewStore(ReviewStore).decide_web(body, request_id=...)` hanya menulis tabel kanonis `reviews`, `commands`, `audit`. Tidak membuka ledger finansial, menjalankan publisher atau mengubah saldo.
- `sync_web_reviews(config, store, publisher=... | publisher_factory=...)` memverifikasi project dan Auth email/UID dengan `financial_review_apply.verify_target` **sebelum akses dokumen apa pun**. Ia membaca path keputusan deterministik untuk revisi saat ini, mengingest keputusan, lalu mengganti mirror dengan proyeksi teredaksi dan readback persis.
- `review_mirror(...)` merupakan proyeksi allowlist satu arah dari SQLite. Field mirror yang dapat dipalsukan browser tidak memasok nominal, status, revisi, endpoint atau registry ke keputusan finansial. Tidak ada scan/query koleksi Firestore untuk menemukan keputusan.
- `run_web_review_hook(...)` mengadaptasi hook yang sama: discovery terlebih dahulu, ingest web sebelum processor kanonis, mirror status kembali setelah processor, lalu notifier asli. Sync kedua memakai `consume=False` agar tidak mengingest perintah kedua pada tick yang sama. Error publikasi tidak meniadakan notifikasi; error web dilaporkan sebagai `web_error` yang disanitasi.
- Hanya processor kanonis `financial_review_apply.process_reviews` menggunakan publisher uang. Validasi bukti/parser/checkpoint terbaru, backup terikat receipt, identitas event/outbox, accounting Increment, readback dan retry ownership tetap berlaku.

Scope source tetap project/email/UID demo dan administrator Telegram terverifikasi. Bridge bukan publisher umum untuk UID arbitrer.

## Flags aktivasi

Keduanya wajib bernilai boolean JSON `true`: `financial_review_enabled` dan `financial_review_web_enabled`. Absen, `false`, string atau angka bukan opt-in. Tanpa web opt-in, sync berhenti sebelum publisher/store dibuat dan wrapper mendelegasikan hook lama tanpa trafik web. Publikasi finansial membutuhkan tambahan `publish_enabled: true` dan `allow_publication=True` pada hook.

Mirror/ingress keputusan dapat berjalan tanpa izin publikasi finansial. Karena itu `--notify-only` bukan mode cloud read-only jika web aktif. Menyalakan fitur tidak menyetujui receipt, tetapi jadwal aktif yang publikasinya sudah diizinkan dapat memproses keputusan eksplisit pada tick yang sama.

## Path dan identitas

Seluruh dokumen berada di `users/{uid}` yang telah diverifikasi. ID mirror adalah ID review SQLite kanonis: **64 hex lowercase**. Revisi adalah prefix fingerprint kanonis: **16 hex lowercase**. Frontend tidak menghitung ulang ID atau revisi.

### Mirror milik server: `financialReviews/{id}`

Setiap sinkronisasi mengganti seluruh dokumen; tidak me-merge extras dari input tidak tepercaya. Field persis:

```text
schemaVersion: 1
id, version, kind, state
amount: integer | null
fee: integer | null
totalCredit: parsed.total_credit integer | null
webDecisionAccepted: boolean dari command SQLite Firebase kanonis saat ini
currency: "IDR" | null
occurredAt: parsed.notification_at ISO string | null
provider: kode provider dari sender_allowlist konfigurasi | null
reason, error: kode diagnostik aman | null
source: parsed.source_wallet yang terdaftar/EXTERNAL/UNRESOLVED | null
destination: parsed.destination_wallet dengan kebijakan yang sama | null
choices: [{action, source, destination}]
walletOptions: [{key, walletId, name}]
event_id: ID event hex kanonis | null
updatedAt: ISO UTC dari record.updated kanonis
```

`fee` berasal dari **`parsed.fee_paid`**, bukan fee display atau dugaan nol. Nilai tidak diketahui tetap null; boolean bukan uang. Provider dipetakan dari alamat sender parser ke allowlist persis, tanpa mengekspor alamat sender. Opsi wallet hanya memuat key/ID terdaftar dan display name yang email/deretan digit panjangnya dimasking.

Tidak ada raw email, account/message ID, identitas sender/destination, konfigurasi, objek parsed/result lengkap, path backup atau exception text di mirror. Kode diagnosis yang hilang/tidak aman menjadi null.

Pilihan finansial hanya tersedia untuk **receipt pending yang belum terikat event**. Delivery/posted/approved/rejected/blocked tidak menawarkan pilihan uang. Setiap kombinasi income/expense/transfer melewati `_endpoints` dan `Engine.reason`; nominal tidak valid, status belum final, biaya dibayar tidak pasti, total bertentangan, error parser tidak aman atau remap endpoint yang sudah diketahui tidak menghasilkan pilihan tidak aman. Reject adalah kontrol nonfinansial, bukan bagian `choices`. Web `retry` dilarang karena retry kanonis dapat mengizinkan publikasi; itu bukan refresh status.

`webDecisionAccepted` bernilai true hanya jika SQLite `commands` memiliki review/revisi persis dengan `platform='firebase'`, `chat_id=uid`, `message_id=id + '--' + version`. Command cloud atau mirror palsu bukan bukti penerimaan. Field tetap true setelah keputusan diterima walaupun processor menjadi blocked/rejected/kembali pending; `choices` lalu kosong. Browser tidak boleh membuka kembali revisi itu. Pemulihan memakai workflow administrator receipt-specific yang tepercaya, bukan browser retry/penghapusan command.

### Keputusan immutable: `financialReviewDecisions/{id}--{version}`

Body memakai allowlist field persis; tidak menerima field tambahan nominal, biaya, kategori, aktor, identitas atau keuangan lain:

```json
{
  "schemaVersion": 1,
  "uid": "<UID target terverifikasi>",
  "reviewId": "<64 hex lowercase kanonis>",
  "version": "<16 hex lowercase revisi kanonis>",
  "action": "transfer",
  "source": "<key wallet terdaftar>",
  "destination": "<key wallet terdaftar>",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

Tanggal di atas hanya metadata sintetis bentuk payload, bukan checkpoint aktivasi.

- `request_id` harus sama dengan `reviewId + '--' + version`; ID/revisi body juga wajib sama dengan path yang dibaca. UID harus sama dengan konfigurasi terverifikasi.
- Income wajib `source: "EXTERNAL"`; expense wajib `destination: "EXTERNAL"`. Pilih tuple kanonis persis dengan key wallet, bukan ID dokumen wallet.
- Reject memakai `source: null, destination: null`; hanya untuk receipt pending yang belum diputuskan atau blocked tanpa event ID dan belum diputuskan.
- Tidak ada browser action baru, termasuk reject, yang menggantikan revisi yang sudah diterima melalui channel tepercaya mana pun. Event terikat adalah pekerjaan recovery kanonis, bukan izin membuat event baru. `retry` ditolak sebelum lookup state/replay, termasuk command retry lama yang identik.
- `createdAt` wajib string ISO/RFC3339 dengan `T`, detik dan timezone (`Z` atau offset `±HH:MM` valid). Tanggal/offset salah, tanpa timezone, objek sentinel server-timestamp, dan tipe non-string ditolak. Ini metadata command, **bukan waktu receipt atau clock kesegaran otorisasi**; revisi bukti saat ini menentukan kesegaran.
- Insert command atomik memakai `platform='firebase'`, `chat_id=uid`, `message_id=request_id`, provenance asli `actor={platform:'firebase',uid:...}`; tidak memalsukan identitas Telegram.
- Replay identik action yang diperbolehkan adalah no-op, termasuk sesudah approved/prepared/posted. Perubahan field payload yang sudah diterima, termasuk `createdAt`, adalah konflik. SQLite `BEGIN IMMEDIATE` mengarbitrasi web/Telegram yang bersamaan; keputusan pertama yang diterima menang.
- Revisi lama, body buruk atau konflik tidak menyebabkan uang atau menghapus/menulis ulang command cloud. Path revisi lama tidak dienumerasi/dikonsumsi ulang. Body current yang ditolak tetap disimpan dan dapat dihitung kembali pada sync berikutnya: retensi, bukan keputusan baru.
- Satu command web immutable per revisi tidak boleh ditimpa, bahkan untuk reject. Resolusi memakai administrator tepercaya receipt-specific atau revisi bukti kanonis yang benar-benar baru, bukan delete/recreate atau forced replay.

## Firestore Rules: gate deployment terpisah

Sebelum aktivasi, uji dan deploy:

- Read mirror/decision hanya untuk owner.
- Write mirror hanya server, bukan owner browser.
- Keputusan browser hanya **create-once exact-schema**; deny update/delete.
- UID Auth sama dengan UID path dan body.
- Hanya reject dengan endpoint null atau financial choice pending yang persis. Tolak retry dan keputusan baru ketika `webDecisionAccepted=true`.

Rules browser dapat generik terhadap owner terautentikasi; worker tetap demo-only. Admin SDK melewati rules sehingga pemeriksaan target tetap wajib.

Firestore meng-OR semua matching allow. `allow ...: false` yang lebih spesifik **tidak membatalkan** grant recursive owner-write. Keluarkan kedua koleksi ini dari grant luas sebelum rules spesifik ditambahkan; jangan melonggarkan koleksi lain. Bridge tetap defensif terhadap mirror palsu, tetapi provenance command immutable terautentikasi bergantung pada rules gate. Tes source rules bukan pengganti Firestore Rules emulator.

## Integrasi, observasi, dan penghentian

Source hook yang disertakan mencoba adapter web di dalam lock hook yang sama dengan fallback `ImportError` ke hook lama. Instalasi lama belum tentu memakai adapter ini: bandingkan revision source yang benar-benar dipanggil scheduler, bukan hanya keberadaan file pada checkout. Integrasi tidak membuat scheduler tambahan.

Sebelum aktivasi yang disetujui:

1. Review/test revision worker dan rules yang cocok; buat backup source/state privat. Instal source secara atomik dengan proses rilis terkontrol, bukan copy parsial saat jadwal aktif.
2. Verifikasi target project/Auth, rules, flags dan path privat secara terpisah. Pertahankan `publish_enabled` kecuali ada izin untuk mengubahnya.
3. Pantau `web_error` dan rejection counter: hook CLI mengembalikan nonzero untuk error web, dan wrapper ops menyimpannya pada `financial_review_error`. Ini bukan izin melakukan retry/replay.
4. Amati hook terjadwal existing; baca kembali mirror/decision persis, command/audit SQLite, serta marker/komponen hanya untuk receipt yang memang disetujui. Tidak memanggil publisher sebagai smoke test.
5. Untuk menutup ingress/mirror, ubah `financial_review_web_enabled` menjadi false secara atomik. Approved/prepared kanonis yang sudah ada tetap diatur processor asli. Menonaktifkan web bukan pembatalan keputusan atau rollback uang; pertahankan audit/command immutable.

Bridge memindai antrean **lokal scoped** dan membaca path cloud current yang persis; tidak listing koleksi cloud atau menemukan command dari mirror. Versi source saat ini memirror seluruh row scoped tiap tick. Optimasi batching perlu cursor adil yang diuji, bukan cap yang selamanya melewati antrean baru. Deadline/transport tetap memakai publisher SDK; tidak ada runner jaringan baru.

## Verifikasi offline

Dari direktori integrasi:

```bash
env -u HERMES_HOME PYTHONDONTWRITEBYTECODE=1 \
  .venv/bin/python -B -m unittest -v test_financial_review_web
```

Source kanonis sekarang tersedia di direktori yang sama; tidak perlu path source eksternal `MESH_SOURCE` ke workspace pribadi. Tes memakai SQLite/adapter dokumen sintetis, bukan config/token/ledger/email aktif. Pertahankan guard tanpa socket/subprocess dan penolakan konstruksi publisher default pada tes yang memerlukannya.

Coverage yang harus dijaga: alur parser → keputusan SQLite → processor kanonis → fake publisher/readback, no-op replay, stale/changed evidence, known-endpoint remap refusal, race web/Telegram dan replay konkuren, reject/no-money, biaya nullable, redaksi, flags opt-in, project/Auth mismatch, retensi immutable, hook errors, web retry selalu ditolak, accepted-command matching dan pilihan kosong sesudah diterima.

Hasil aktual ada pada [status validasi](validation.md). Hasil offline tidak membuktikan IAM/rules cloud, instalasi, pengiriman browser, event posting atau aktivasi produksi. Angka tes historis bridge tidak dipakai sebagai hasil revision integrasi ini.
