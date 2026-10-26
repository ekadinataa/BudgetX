# Status validasi integrasi

Dokumen ini memisahkan hasil source/offline dari instalasi dan operasi layanan eksternal. Tidak mengambil angka tes, saldo, incident atau klaim aktivasi dari README worker lama.

## Evidence rilis

Bagian ini diisi integrator dari output nyata setelah seluruh source, scripts, dependency, docs dan tests digabung. Placeholder bukan tanda lulus.

| Gate | Evidence revision ini |
| --- | --- |
| Revision source / artifact | `PENDING_INTEGRATOR_VALIDATION` |
| Bootstrap pada environment bersih dengan `requirements.lock` | `PENDING_INTEGRATOR_VALIDATION` |
| `scripts/manage.py check`: source/AST/SDK, bukan suite | `PENDING_INTEGRATOR_VALIDATION` |
| Unit/integration Python sintetis penuh, `HERMES_HOME` unset | `PENDING_INTEGRATOR_VALIDATION` |
| Suite n8n dan plugin terpisah | `PENDING_INTEGRATOR_VALIDATION` |
| Helper OAuth: tes loopback sintetis tanpa consent nyata | `PENDING_INTEGRATOR_VALIDATION` |
| Init-config privat, flags nonaktif, tanpa jadwal/secret | `PENDING_INTEGRATOR_VALIDATION` |
| Doctor validasi lokal tanpa jaringan/penulisan | `PENDING_INTEGRATOR_VALIDATION` |
| Frontend helper/rules, lint/build sesuai perubahan | `PENDING_INTEGRATOR_VALIDATION` |
| Link dokumentasi dan JSON template | Pemeriksaan lokal: 9 dokumen Markdown, seluruh link relatif ditemukan, code fence seimbang; JSON dan assertion flags/placeholder/alias/target alert aman lulus. Ulangi setelah perubahan integrator |
| Audit secret/PII dan corpus privat | `PENDING_INTEGRATOR_VALIDATION` |
| Review independen | `PENDING_INTEGRATOR_VALIDATION` |

Catat jumlah passed/failed/skipped dan warning dari eksekusi saat ini, versi Python/OS, command dan batas coverage. Jangan mengganti placeholder dengan hasil yang hanya diasumsikan dari source review, JSON valid atau suite yang belum selesai.

## Tidak dibuktikan oleh check offline

- Refresh/consent OAuth Gmail, scope dan identity mailbox aktif.
- Akses IAM Admin, lookup Auth, rules cloud/emulator, atau validitas wallet/checkpoint runtime.
- Instalasi/restart plugin, impor/aktivasi n8n, scheduler atau watchdog yang berjalan.
- Migrasi konfigurasi/state dari runtime existing atau pemasangan source teruji ke path scheduler.
- Publikasi event riil, readback saldo/marker, penerimaan notifikasi oleh pengguna atau delivery browser.
- Restore produksi atau kompatibilitas downgrade schema.

Gate tersebut sengaja tidak dijalankan otomatis dan memerlukan persetujuan tindakan/target. Tidak ada receipt privat, alamat provider pribadi, ID finansial atau bukti operasional sensitif yang boleh ditambahkan ke laporan publik.

## Batas implementasi yang harus diperhatikan saat rilis

- Scope publisher masih hardcoded demo + akun kolektor yang diizinkan; template generic bukan dukungan multi-user.
- Core memakai POSIX `fcntl`; runtime Windows native bukan target yang dijanjikan.
- Source integrasi me-resolve Hermes executable/profile dan membutuhkan target alert eksplisit; template tidak mengirim alert. Pemeriksaan service watchdog masih mengacu pada `hermes-gateway.service`, jadi deployment n8n memerlukan review indikator kesehatan tersendiri.
- Regresi packaging menguji bahwa `web_error` menyebabkan CLI nonzero dan diteruskan ke `financial_review_error`; ini bukan bukti delivery notifikasi/cloud aktual.
- Backup source memasukkan bridge web, ekstraktor MIME dan dependency lock. Source opsional plugin/n8n tersedia pada revision Git; kredensial, profil, archive eksternal dan rencana per-insiden tetap harus dipulihkan operator secara privat.
- `not_transaction` historis dan `ready` tanpa event binding tidak otomatis diproses ulang oleh retry parser normal.
- Tests source-contract Firestore Rules tidak membuktikan evaluasi Rules emulator atau IAM service account.

Daftar ini mencatat hal yang perlu diperiksa, bukan bukti bahwa instalasi runtime tertentu sedang bermasalah.
