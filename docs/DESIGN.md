# BudgetX — Spesifikasi Design UI/UX

**Produk:** BudgetX — Money Tracker
**Versi dokumen:** 1.0
**Status:** Dokumen dasar pra-revamp; pembaruan proporsi terbaru di bawah ini
**Live:** https://budgetx.web.app
**Dokumen terkait:** `FUNCTIONAL_SPECIFICATION.md` (fungsi), `TECHNICAL_SPECIFICATION.md` (arsitektur), `USER_GUIDE.md` (panduan pengguna)

---

## Pembaruan UI — 1 Oktober 2026

Migrasi kelas global selesai untuk seluruh 13 halaman, dialog, autentikasi,
dan CategoryPicker. Tidak ada lagi file atau impor CSS Module. Primitive
bersama digunakan langsung; detail khusus memakai prefix `invest`, `asset`,
`report`, `fire`, `settings`, `help`, `categoryPicker`, dan `auth`.

Acuan visual aktif adalah `../budgetx-revamp/budgetx-app.html`. Bagian rinci
di bawah merekam implementasi sebelum revamp; untuk primitive terbaru, gunakan
`src/styles/tokens.css`, `src/styles/base.css`, dan aturan ini:

| Konteks | Desktop standar | Mobile/touch |
|---|---:|---:|
| Toolbar/filter: tombol, select, grup segmented | 36px | 44px |
| Form dan aksi utama dialog | 40px | 44px |
| Aksi di dalam kartu/baris | 32px | 44px |

- Tinggi, font, padding dan radius kontrol mengikuti token `--control-*`.
  Preset Padat/Longgar mengubah ukuran desktop secara terbatas; radius kontrol
  dibatasi 10px, sementara radius kartu mengikuti preferensi pengguna.
- Judul dan subjudul tetap dalam satu kelompok. Aksi halaman ditempatkan di
  topbar; susunannya dapat membungkus di layar sempit tanpa mengecilkan select.
- Filter Transaksi punya baris pencarian, baris periode, serta panel chip
  terpisah. Panel chip bukan segmented control.
- Budget memakai empat kartu ringkasan dan grid kategori 3/2/1 kolom.
  Kategori kosong tidak menghasilkan area padding kosong.
- Dialog memakai `Modal` dan kelas global `overlay`/`modalHead`/`modalBody`.
  Aksi simpan/hapus berada dalam footer yang mempunyai gap dan alignment.
- Pengujian browser mencakup data kosong/terisi dan cabang UI terbuka;
  lulus pemeriksaan overflow saja tidak membuktikan proporsi sudah benar.

---

## 🎯 Tujuan Dokumen Ini

Dokumen ini adalah **spesifikasi regenerasi UI**. Siapa pun yang membaca dokumen ini —
termasuk LLM — harus dapat membangun ulang seluruh antarmuka BudgetX tanpa membuka
file source.

Konsekuensinya:

1. **Setiap string Bahasa Indonesia ditulis verbatim** (dalam backtick), bukan diparafrase.
   Persis seperti yang muncul di layar.
2. **Setiap class CSS dan token Design System dicatat**, lengkap dengan nilai yang resolved.
3. **Perilaku interaktif dan state** (empty, loading, error, validasi) digambarkan eksplisit,
   termasuk state yang *tidak ada*.
4. Bagian utama (Part 0–7) adalah **spesifikasi apa adanya**. Temuan masalah dipisahkan
   ke **Part 8 — Audit & Inkonsistensi** agar tidak tercampur dengan spesifikasi.

---

## 📑 Daftar Isi

| Part | Judul | Isi |
|---|---|---|
| 0 | Orientasi | Aturan fundamental yang berlaku di seluruh app |
| 1 | Design Tokens | Seluruh token: warna, tipografi, spacing, radius, elevasi, motion |
| 2 | App Shell & Layout | Struktur `#root`, container measure, breakpoint, layar gate, toast |
| 3 | Navigasi | Sidebar desktop, mobile top bar, dropdown, bottom nav + FAB |
| 4 | Komponen Inti | Modal, primitif UI, ikon, chart, HelpChat, DataMigrator |
| 5 | Autentikasi | Login, Daftar, Reset Password |
| 6 | 13 Halaman | Spesifikasi lengkap tiap halaman |
| 7 | Cross-Cutting Patterns | Pola yang berulang lintas halaman |
| 8 | Audit & Inkonsistensi | Temuan yang tidak boleh disalin sebagai teladan |
| 9 | Peta File → Spec | Coverage check |
| 10 | Data Seed | Nilai default yang dirender saat pertama jalan |

---

# Part 0 — Orientasi

## 0.1 Identitas Produk

| Atribut | Nilai |
|---|---|
| Nama | `BudgetX` |
| Tagline | `Money Tracker` |
| Judul tab browser | `BudgetX – Money Tracker` |
| Bahasa UI | Bahasa Indonesia (`<html lang="id">`) |
| Locale format | `id-ID` |
| Mata uang | Rupiah Indonesia (IDR), tanpa desimal |
| Orientasi | Portrait-first, responsif (mobile → desktop) |
| Target | Milenial & Gen-Z Indonesia |

## 0.2 Aturan Fundamental

### A. Semua teks UI berbahasa Indonesia

Termasuk pesan error, label button, empty state, dan tooltip. **Pengecualian yang ada di
kode** (jangan tirukan, lihat Part 8): `aria-label="Close"` pada Modal, `title="Expand sidebar"`,
dan beberapa string campuran Inggris–Indonesia.

### B. Format angka

Dua fungsi di `src/utils/formatters.js`. Jangan pernah memformat angka secara manual.

| Fungsi | Keluaran | Contoh input → output |
|---|---|---|
| `fmtFull(n)` | `Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0})` | `1500000` → `Rp1.500.000` |
| `fmt(n)` | Singkat: ≥1jt → `1,5jt`; ≥1rb → `500rb`; selain itu angka mentah | `1500000` → `1,5jt`, `500000` → `500rb`, `800` → `800` |
| `fmtDate(d)` | `{day:'numeric', month:'short', year:'numeric'}` locale `id-ID` | `2026-04-19` → `19 Apr 2026` |
| `monthKey(date)` | `YYYY-MM` | `2026-04-19` → `2026-04` |

> `fmtDate` memakai bulan **pendek** (`Apr`). Beberapa tempat memakai bulan **panjang**
> (`April 2026`) secara inline — lihat Part 6 per halaman.

### C. Angka selalu rata kolom

Nilai yang akan dibandingkan discan user (nominal, persentase, tanggal) memakai
`font-variant-numeric: tabular-nums`. Di design system ini seharusnya `var(--font-mono)`,
**tetapi implementasi aktual memakai `font-weight: 600/700/800` + `tabular-nums` saja**,
dengan font body. Lihat Part 8.4.

### D. Navigasi tanpa router

Tidak ada `react-router`. Halaman adalah `string` state di `App.jsx` dan dipilih lewat
`switch (page)`. Nilai yang valid (13):

```
dashboard · wallet · tx · budget · recurring · subscription · debt
invest · asset · report · fire · settings · help
```

Menambah halaman = menambah `case` di `switch` + item di `Sidebar`.

### E. Sumber kebenaran warna

`src/styles/tokens.css` adalah **satu-satunya** tempat nilai warna didefinisikan.
Warna hex yang di-hardcode di JSX/CSS Module adalah sisa migrasi dari design system
sebelumnya — **jangan tirukan, lihat Part 8.2**.

### F. Dark mode

`ThemeContext` hanya melakukan satu hal: menyetel/menghapus atribut
`data-theme="dark"` pada `:root`. Nilai warna dark **wajib** ada sebagai override
`:root[data-theme="dark"]` di `tokens.css`, bukan di-inject sebagai custom property
inline dari JS.

---

# Part 1 — Design Tokens

Sumber: `src/styles/tokens.css` (199 baris). File ini adalah kontrak visual tunggal.

## 1.1 Ground & Ink — Permukaan dan Teks

Token ini membentuk ramp 3 lapis: background aplikasi → permukaan → permukaan cekung.

| Token | Light | Dark | Peran |
|---|---|---|---|
| `--bg` | `#f4f7fb` | `#0d1522` | Background halaman (di luar kartu) |
| `--surface` | `#ffffff` | `#131d2e` | Background kartu / panel |
| `--surface-warm` | `#eef6ff` | `#18243a` | Subtle fill: header tabel, badge ikon, hover |
| `--surface-sunk` | `#e9eff7` | `#0f1828` | Cekung: track progress bar, segmented control |
| `--fg` | `#111827` | `#e8eef7` | Teks utama |
| `--fg-2` | `#334155` | `#b6c2d4` | Teks sekunder |
| `--muted` | `#5b6b83` | `#8b9ab1` | Teks tersier, caption, placeholder |
| `--border` | `#d8e2ee` | `#24324a` | Border utama, garis pemisah |
| `--border-soft` | `#edf3f8` | `#1b2740` | Border halus: pemisah baris di dalam kartu |

Ramp ini **inverted** di dark: `--surface-warm` (lebih terang dari surface) tetap di atas
`--surface`, dan `--surface-sunk` (lebih gelap) di bawah — konsisten dengan light.

## 1.2 Accent — Sumbu HSL

Hue adalah **sumbu personalisasi**: ganti `--accent-h` dan seluruh aksen mengikuti.
Warna accent yang sudah diturunkan **tidak boleh ditulis ulang manual**.

```css
--accent-h: 199;   /* cyan */
--accent-s: 88%;
--accent-l: 42%;   /* light mode */
```

| Token | Light | Dark | Peran |
|---|---|---|---|
| `--accent` | `hsl(199 88% 42%)` | `hsl(199 88% 52%)` | Tombol primary, fill bar, titik data |
| `--accent-on` | `#ffffff` | `#ffffff` | Teks di atas `--accent` |
| `--accent-ink` | `hsl(199 85% 29%)` | `hsl(199 85% 68%)` | Teks aksen (link, chip aktif, eyebrow) |
| `--accent-soft` | `hsl(199 88% 42% / 0.1)` | `hsl(199 88% 52% / 0.16)` | Isian lembut: badge, bar selected |
| `--accent-line` | `hsl(199 60% 72%)` | `hsl(199 60% 46%)` | Border aksen: chip border, hover input |
| `--accent-hover` | `color-mix(in oklab, var(--accent), black 8%)` | `… white 8%` | Tombol primary hover |
| `--accent-active` | `color-mix(in oklab, var(--accent), black 14%)` | `… white 14%` | Tombol primary active |

**Aturan dark theme:** hue tetap `199`. Yang berubah hanya `lightness` (`42%` → `52%`) dan
arah pencampuran hover (`black` → `white`) agar kontras tetap terbaca di permukaan gelap.

## 1.3 Status — 4 Semantic Color

Setiap status punya **3 varian**: vivid (untuk mark/gambar), `-ink` (untuk teks, rasio
kontras ≥ 5:1), dan `-soft` (untuk isian background).

| Status | Vivid | `-ink` (teks) | `-soft` (isian) |
|---|---|---|---|
| Sukses / pemasukan | `#10b981` | `#0f7a58` (dark: `#5ee0ac`) | `#e5f6ef` (dark: `#0e2a20`) |
| Peringatan | `#f59e0b` | `#8a5a00` (dark: `#f5c264`) | `#fdf3e0` (dark: `#2b2113`) |
| Bahaya / pengeluaran | `#ef4444` | `#b42318` (dark: `#ff9a92`) | `#fdeceb` (dark: `#2c1618`) |
| Informasi | `#3b82f6` | `#1d4ed8` (dark: `#8ab4ff`) | `#e8f0fe` (dark: `#12203a`) |

> **Pola pairing yang wajib dijaga:** setiap `-ink` selalu berpasangan dengan `-soft`.
> Di dark mode `-ink` diterangkan dan `-soft` digelapkan, sehingga badge teks-tinted
> di atas permukaan gelap tetap terbaca.

## 1.4 Tipografi

```css
--font-display: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-body:    "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono:    "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

`IBM Plex Sans` dan `IBM Plex Mono` dimuat via Google Fonts di `index.html`
(`wght@400;500;600;700` untuk Sans, `wght@500;600` untuk Mono).

**⚠️ Lihat Part 8.1** — `App.css` meng-override `font-family` body ke
`'Plus Jakarta Sans'`, font yang tidak pernah dimuat. Putuskan dengan sadar.

### Skala ukuran

| Token | px | Token | px |
|---|---|---|---|
| `--text-xs` | 11 | `--text-2xl` | 30 |
| `--text-sm` | 13 | `--text-3xl` | 42 |
| `--text-base` | 15 | `--text-4xl` | 56 |
| `--text-lg` | 17 | | |
| `--text-xl` | 22 | | |

| Token | Nilai | Peran |
|---|---|---|
| `--leading-body` | `1.48` | Line-height body |
| `--leading-tight` | `1.1` | Line-height heading |
| `--tracking-display` | `-0.015em` | Letter-spacing heading |

## 1.5 Spacing — Baseline 8pt

| Token | px | | Token | px |
|---|---|---|---|---|
| `--space-1` | 4 | | `--space-6` | 24 |
| `--space-2` | 8 | | `--space-8` | 32 |
| `--space-3` | 12 | | `--space-12` | 48 |
| `--space-4` | 16 | | | |
| `--space-5` | 20 | | | |

### Density Axis

`--density-scale` mengalikan seluruh pad/gap turunan. Default `1`.

| Token | Formula |
|---|---|
| `--pad-card` | `calc(var(--space-5) * var(--density-scale))` → 20px |
| `--pad-tight` | `calc(var(--space-3) * var(--density-scale))` → 12px |
| `--gap-block` | `calc(var(--space-4) * var(--density-scale))` → 16px |
| `--gap-section` | `calc(var(--space-6) * var(--density-scale))` → 24px |
| `--row-pad` | `calc(10px * var(--density-scale))` → 10px |

### Preset Density (sudah di-wire, belum ada UI-nya)

```css
[data-density="relaxed"]  { --density-scale: 1.16; }
[data-density="standard"] { --density-scale: 1; }
[data-density="compact"]  { --density-scale: 0.84; }
```

## 1.6 Radius

| Token | Formula | Default |
|---|---|---|
| `--radius-sm` | `calc(8px * var(--radius-scale))` | 8px |
| `--radius-md` | `calc(12px * var(--radius-scale))` | 12px |
| `--radius-lg` | `calc(18px * var(--radius-scale))` | 18px |
| `--radius-pill` | `9999px` | pill |

### Preset Radius (sudah di-wire, belum ada UI-nya)

```css
[data-radius="sharp"] { --radius-scale: 0.5; }
[data-radius="soft"]  { --radius-scale: 1; }
[data-radius="round"] { --radius-scale: 1.5; }
```

## 1.7 Elevasi, Focus, Motion

| Token | Nilai | Peran |
|---|---|---|
| `--elev-flat` | `none` | Default |
| `--elev-ring` | `0 0 0 1px var(--border)` | Border card standar (dipakai semua kartu!) |
| `--elev-raised` | `0 18px 46px rgba(15,23,42,0.1)` (dark: `.5`) | Toast, menu dropdown |
| `--elev-sheet` | `0 24px 60px rgba(15,23,42,0.18)` (dark: `.62`) | Modal |
| `--focus-ring` | `0 0 0 4px hsl(199 88% 42% / 0.24)` (dark: `52% / 0.3`) | Focus keyboard |

| Token | Nilai |
|---|---|
| `--motion-fast` | `120ms` |
| `--motion-base` | `200ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |

> **Keputusan visual penting:** kartu tidak memakai drop shadow. Default kartu adalah
> `border: 1px solid var(--border-2)` + `box-shadow: none`. Hanya toast, dropdown, dan
> HelpChat yang memakai shadow elevated.

## 1.8 Grid & Container

| Token | Nilai | Peran |
|---|---|---|
| `--container-max` | `1280px` | Lebar maksimum konten |
| `--container-gutter-desktop` | `36px` | Padding sisi di ≥1024px |
| `--container-gutter-tablet` | `24px` | Padding sisi di 768–1023px |
| `--container-gutter-phone` | `16px` | Padding sisi di ≤767px |
| `--header-h` | `64px` | **Dideklarasikan tapi tidak dipakai** — app tidak punya topbar desktop |

## 1.9 Alias Legacy (WAJIB DIPAHAMI)

~12 CSS Module masih memakai nama token lama. Alias ini memungkinkan migrasi bertahap.
**Hapus hanya setelah semua modul sudah pindah** ke token baru.

| Alias | → | Alias | → |
|---|---|---|---|
| `--bg-card` | `var(--surface)` | `--text-1` | `var(--fg)` |
| `--bg-2` | `var(--surface-warm)` | `--text-2` | `var(--fg-2)` |
| `--bg-3` | `var(--surface-sunk)` | `--text-3` | `var(--muted)` |
| `--border-2` | `var(--border-soft)` | `--text-4` | `var(--muted)` |
| `--sidebar-bg` | `#0e1626` (dark: `#080e18`) | `--text-5` | `var(--muted)` |
| | | `--text-6` | `var(--border)` |

**⚠️ `--text-3`, `--text-4`, `--text-5` semuanya resolve ke nilai yang sama (`--muted`).**
Jadi ramp teks yang diasumsikan modul sebenarnya hanya 3 tingkat: `--text-1` (utama),
`--text-2` (sekunder), `--text-3/4/5` (tersier). `--text-6` adalah warna border, bukan
teks. Lihat Part 8.5.

### Token Badge & Section Pill

Didefinisikan di blok `:root` (bukan hanya dark) agar bisa dipakai tanpa fallback:

```css
--tx-badge-income-bg:    var(--success-soft);   --tx-badge-income-color:    var(--success-ink);
--tx-badge-expense-bg:   var(--danger-soft);    --tx-badge-expense-color:   var(--danger-ink);
--tx-badge-transfer-bg:  var(--accent-soft);    --tx-badge-transfer-color:  var(--accent-ink);
--section-pill-needs-bg/color:    var(--accent-soft) / var(--accent-ink);
--section-pill-wants-bg/color:    var(--warn-soft)   / var(--warn-ink);
--section-pill-savings-bg/color:  var(--success-soft)/ var(--success-ink);
```

## 1.10 Ringkasan Prioritas Penggunaan Token

Dari pengukuran seluruh `src/`, token yang **benar-benar dipakai** (urutan frekuensi):

```
--text-4 (107)  --text-1 (93)  --border (71)  --text-5 (69)  --border-2 (59)
--bg-card (51)  --text-3 (50)  --text-2 (50)  --bg-3 (47)    --bg-2 (38)
--space-2 (21)  --space-3 (17)  --text-6 (16)  --muted (16)   --text-xs (15)
--accent (14)   --fg-2 (11)    --danger (11)  --radius-md (10) --fg (10) --accent-ink (10)
```

Token "modern" (`--surface`, `--fg`) dipakai sangat sedikit; legacy alias mendominasi.
Saat menulis CSS baru, **gunakan token modern** (`--surface`, `--fg`, `--muted`,
`--border-soft`) dan ingat bahwa output visualnya sama persis.

## 1.11 Primitif Layout (`.od-*`)

Berada di `src/styles/base.css`. Awalnya untuk design system generik. Praktisnya
**belum dipakai** (lihat Part 1.12), tapi tetap didokumentasikan.

| Class | Properti |
|---|---|
| `.od-stack` | `flex column`, gap `var(--od-gap, 8px)` |
| `.od-row` | `flex row`, `align-items:center`, gap `var(--od-gap, 8px)` |
| `.od-row-top` | `flex row`, `align-items:flex-start`, gap |
| `.od-cluster` | `flex wrap`, `align-items:center`, gap |
| `.od-fill` | `flex: 1 1 0; min-width: 0` |
| `.od-fixed` | `flex: none` |
| `.od-grid` | `grid`, `gap`, `repeat(var(--od-cols, 3), minmax(0,1fr))` |
| `.od-stat` | `grid`, gap `2px` |
| `.od-truncate` | `nowrap` + ellipsis |
| `.od-clamp-2` | `-webkit-line-clamp: 2` |
| `.od-nowrap` | `white-space: nowrap` |
| `.od-touch` | `min-width/height: 44px` |

## 1.12 ⚠️ Fakta Penting: `base.css` Belum Diadopsi

`src/styles/base.css` (394 baris) berisi komponen global lengkap: `.panel`, `.status`,
`.metric-grid`, `.row-list`, `.chip`, `.badge`, `.bar`, `.goal`, `.btn`, `.icon-btn`,
`.filter-chip`, `.field`, `.error-summary`, `.segmented`, `.callout`, `.empty`,
`.skeleton`, `.toast`, dan primitif `.od-*`.

**Hasil verifikasi: 0 dari class-class tersebut dipakai di seluruh `src/**/*.jsx`.**

Jadi pada faktanya:

- UI **tidak** dibangun di atas sistem komponen `base.css`.
- UI dibangun dari **CSS Module per halaman** (`.pageTitle`, `.summaryCard`, `.cardRow`,
  `.btnPrimary`, …) yang masing-masing menyalin ulang pola yang sama.
- `base.css` hanya menyumbangkan: reset, tipografi dasar, `.icon`, `.sr-only`,
  `.skip-link`, `prefers-reduced-motion`, dan blok `@media` global.
- `App.css` hanya menyumbahkan `#root`, `.appMain`, `.appToast`, `.dash` grid, dan
  keyframes.

**Konsekuensi untuk regenerasi:** jangan membuat komponen dari `base.css` dan
menganggap itu cara yang benar. Ikuti **Part 7 — Cross-Cutting Patterns** yang
meng-deskripsikan pola yang benar-benar dipakai di 5+ halaman.

Variabel yang **direferensikan tapi tidak pernah dideklarasikan** (selalu jatuh ke
fallback): `--amount-income`, `--amount-expense`, `--amount-transfer`, `--bg-hover`,
`--od-cols`, `--od-gap`.

---

# Part 2 — App Shell & Layout

## 2.1 Struktur Root

```css
#root { height: 100%; display: flex; }
```

Dua anak flex:

```
┌─────────────────────────────────────────────────────────┐
│ <aside>  Sidebar      │  <main class="appMain">          │
│ position: sticky      │  flex: 1; min-width: 0           │
│ top: 0; height:100vh  │  overflow-y: auto                │
│ width: 240px | 68px   │  background: var(--bg)            │
└─────────────────────────────────────────────────────────┘
```

Di `≤768px`: `#root { flex-direction: column }` dan `<aside>` di-`display:none`
(digantikan mobile top bar + bottom nav).

## 2.2 Container Measure — `PAGE_WIDTH`

Padding & max-width diterapkan pada **anak langsung** `.appMain`, bukan pada `.appMain`
sendiri:

```css
.appMain > * {
  max-width: var(--container-max);          /* 1280px */
  margin-inline: auto;
  padding-inline: var(--container-gutter-desktop);  /* 36px */
  padding-block: var(--space-8) var(--space-12);    /* 32px atas, 48px bawah */
}
.appMain > .pageMeasure      { max-width: calc(880px + 2 * 36px); }
.appMain > .pageMeasureTight { max-width: calc(680px + 2 * 36px); }
```

### Tabel Measure per Halaman

| `page` | Class | Lebar efektif | Alasan |
|---|---|---|---|
| `dashboard` | `''` | 1280px | Data-berat: grid 2 kolom + kalender |
| `wallet` | `''` | 1280px | Grid kartu yang butuh lebar |
| `tx` | `''` | 1280px | Chip filter + tabel transaksi |
| `budget` | `pageMeasure` | 880px | Form & card stack |
| `recurring` | `pageMeasure` | 880px | Card list, kolom tunggal |
| `subscription` | `pageMeasure` | 880px | Card list, kolom tunggal |
| `debt` | `pageMeasure` | 880px | Card list, kolom tunggal |
| `invest` | `pageMeasure` | 880px | Card list, kolom tunggal |
| `asset` | `''` | 1280px | Dashboard kesehatan keuangan |
| `report` | `''` | 1280px | Chart grid 2 kolom |
| `fire` | `''` | 1280px (wrapper 900px) | Chart lebar |
| `settings` | `pageMeasure` | 880px | Form |
| `help` | `pageMeasureTight` | 680px | Baca panjang |

**Prinsip:** kolom tunggal yang melar 1280px menghasilkan card kosong dan label form
yang jauh dari input-nya. Halaman form/prose mendapat measure; halaman data-berat
mendapat container penuh.

## 2.3 Grid 12-Kolom (`.dash`)

Tersedia untuk halaman dashboard:

```css
.dash {
  display: grid; gap: var(--gap-section);
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: start;
}
.dash__wide  { grid-column: span 12; }
.dash__half  { grid-column: span 6; }
.dash__third { grid-column: span 4; }
```

Kolaps ke 1 kolom di `≤768px`.

## 2.4 Breakpoint

### Ladder referensi design system

`1180 / 1023 / 860 / 768 / 639`

### Yang benar-benar dipakai

| Breakpoint | Scope | Perilaku |
|---|---|---|
| **1180px** | `base.css` saja | `.metric-grid` → 2 kolom |
| **1023px** | `App.css` | Gutter → 24px |
| **520px (container query)** | Dashboard Calendar | Grid bulan & detail hari berubah side-by-side ↔ stacked |
| **1100px** | Dashboard | `.budgetList` 3 kolom → 1 kolom |
| **769px** | Dashboard | Hero card & greeting `display:none`; quick menu jadi rail horizontal |
| **768px** | **App shell + semua halaman** | Sidebar → bottom nav; container measure tetap |
| **480px** | Investment saja | `.summaryGrid` 2 kolom → 1 kolom |
| **639px** | `base.css` saja | `.metric-grid` → 1 kolom |

**768px adalah breakpoint utama**, dipilih karena saat itu Sidebar berubah menjadi
bottom nav. Hampir setiap CSS Module hanya punya **satu** media query `@media
(max-width: 768px)`.

## 2.5 Lima Layar Gate (render bersyarat di `App.jsx`)

Urutannya — **berhenti di layar pertama yang cocok**:

### Gate 1 — Auth Loading
```
Kondisi : !IS_LOCAL_MODE && authLoading
Layout  : flex center, 100vh × 100vw, background var(--bg)
Spinner : 40×40px, border 3px solid var(--border), borderTopColor #4F6EF7,
          borderRadius 50%, animation spin 0.8s linear infinite
Teks    : `Memuat...`   (14px, var(--text-4))
```

### Gate 2 — Belum Login
```
Kondisi : !IS_LOCAL_MODE && !user
Render  : switch(authPage) → 'register' | 'forgot' | default 'login'
Layout  : kartu auth terpusat (lihat Part 5)
```

### Gate 3 — Migrasi Data Lokal
```
Kondisi : !IS_LOCAL_MODE && user && !authLoading && !migrationChecked
          && localStorage['budgetku_state'] ada
Render  : <DataMigrator /> full-viewport  →  (lihat Part 4.7)
App shell (Sidebar, HelpChat) TIDAK di-mount di state ini
```

### Gate 4 — Data Loading
```
Kondisi : !IS_LOCAL_MODE && dataLoading
Layout  : sama seperti Gate 1
Teks    : `Memuat data...`
```

### Gate 5 — Data Error
```
Kondisi : !IS_LOCAL_MODE && dataError && wallets.length === 0
Layout  : flex column center, gap 16
Teks    : `Gagal memuat data. Periksa koneksi Anda.`   (#EF4444, 15px)
Tombol  : `Coba Lagi`  → padding 10px 24px, radius 8,
           background #4F6EF7, color #fff, 14px, weight 600
```

> Halaman individual **tidak punya** loading state. Semua loading ditangani di shell.

## 2.6 Toast

```
Posisi   : fixed; bottom 24px; right 24px; z-index 9999; max-width 360px
Style    : background #1E293B; color #F1F5F9; padding 12px 20px;
           border-radius 10px; font-size 13px; font-weight 500;
           box-shadow 0 8px 24px rgba(0,0,0,0.2)
Animasi  : fadeIn 0.2s ease (keyframes di-inject via <style> inline)
Durasi   : 4000ms, auto-dismiss
Mobile   : ≤768px → bottom 88px (menghindari bottom nav 64px)
```

- Hanya **satu** toast pada satu waktu (string tunggal, bukan antrean).
- **Tidak bisa** ditutup dengan klik, tidak ada `role="status"` / `aria-live`.
- Warna hardcoded, tidak mengikuti dark mode.
- Lihat Part 8.7.

### Katalog Pesan Toast

**Sukses:**
```
Item berkala berhasil ditambahkan.        Item berkala berhasil dihapus.
Pembelian ulang berhasil dicatat.        Utang/piutang berhasil ditambahkan.
Utang/piutang berhasil diubah.            Utang/piutang berhasil dihapus.
Pembayaran berhasil dicatat.              Investasi berhasil ditambahkan.
Investasi berhasil diubah.               Investasi berhasil dihapus.
Pembelian berhasil dicatat.              Penjualan berhasil dicatat.
Nilai investasi berhasil diperbarui.      Langganan berhasil ditambahkan.
Langganan berhasil diubah.               Langganan berhasil dihapus.
Pembayaran langganan berhasil dicatat.    Aset tetap berhasil ditambahkan.
Aset tetap berhasil diubah.              Aset tetap berhasil dihapus.
Data berhasil direset.                    Data berhasil diimpor.
Kategori berhasil ditambahkan.           Kategori berhasil diperbarui.
Kategori berhasil dihapus.                Data berhasil diekspor.
```

**Gagal:**
```
Gagal memuat data dari server.        Gagal memuat data. Periksa koneksi Anda.
Gagal membuat dompet.                 Gagal mengubah dompet.
Gagal menghapus dompet.               Gagal membuat transaksi.
Gagal mengubah transaksi.             Gagal menghapus transaksi.
Gagal menyimpan budget.               Gagal membuat kategori.
Gagal mengubah kategori.              Gagal menghapus kategori.
Gagal membuat item berkala.           Gagal mengubah item berkala.
Gagal menghapus item berkala.         Gagal membuat utang/piutang.
Gagal membuat transaksi utang/piutang.  Gagal mengubah utang/piutang.
Gagal menghapus utang/piutang.        Gagal membuat transaksi pembayaran.
Gagal mencatat pembayaran.            Data utang/piutang tidak ditemukan.
Gagal membuat investasi.              Gagal mengubah investasi.
Gagal menghapus investasi.            Data investasi tidak ditemukan.
Gagal membuat transaksi pembelian.    Gagal mencatat pembelian.
Gagal membuat transaksi penjualan.    Gagal mencatat penjualan.
Gagal memperbarui nilai investasi.    Gagal membuat langganan.
Gagal mengubah langganan.             Gagal menghapus langganan.
Langganan tidak ditemukan.           Gagal membuat aset tetap.
Gagal mengubah aset tetap.            Gagal menghapus aset tetap.
Gagal migrasi data. Coba lagi.
Gagal membuat file CSV.               Gagal mengunduh file.
Gagal membaca file.                   File terlalu besar (maks 10MB)
Data tidak valid: {error}
```

**Impor:** ``Impor CSV selesai: {parts}``, ``Impor selesai: {n} ditambahkan, {m} dilewati``

**Kategori:** ``Tidak dapat menghapus '{nama}' — sedang digunakan di {parts}``
(`parts` = `` `${n} transaksi` `` dan/atau `alokasi budget`, digabung `' dan '`)

## 2.7 Global App.css

```css
/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Body */
html, body { height: 100%; font-family: 'Plus Jakarta Sans', sans-serif; }

/* Transisi theme */
* { transition: background-color .3s ease, border-color .3s ease, color .2s ease; }
html, body { transition: background .3s ease, color .3s ease; }

/* Input global */
input, select, textarea {
  min-height: 44px; border-radius: 12px;      /* hanya ≤768px */
  transition: background .2s, border-color .2s, color .2s;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--accent) !important;
  box-shadow: var(--focus-ring);
}

/* Select: chevron inline SVG */
select { appearance: none; padding-right: 30px !important;
         background-image: url("data:image/svg+xml,…%2394A3B8…"); }

/* Button global */
button:hover { opacity: 0.88; }

/* Scrollbar kustom */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

/* Tombol sentuh global (≤768px) */
button { min-height: 44px; }
```

## 2.8 Keyframe Animasi

| Keyframe | Definisi | Dipakai? |
|---|---|---|
| `fadeInUp` | `opacity 0→1`, `translateY(12px)→0`, `.3s ease-out` | ✅ 8 modul CSS mendeklarasikan & memakainya sendiri |
| `slideDown` | (dideklarasikan per modul) | ✅ `HelpPage.module.css` (accordion) |
| `countUp` | `opacity 0→1`, `scale(.8)→1` | ❌ **dead code** |
| `slideInRight` | `opacity 0→1`, `translateX(20px)→0` | ❌ **dead code** |

Karena CSS Modules meng-scope keyframe per file, setiap modul yang butuh `fadeInUp`
mendeklarasikan salinannya sendiri.

## 2.9 index.html

```html
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/png" href="/logo.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BudgetX – Money Tracker</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script>/* FOUC guard: baca budgetku_state, set data-theme="dark" */</script>
  <script type="module" src="/src/main.jsx"></script>
</body>
```

**FOUC guard** — script inline sebelum React, di dalam `try/catch` (aman untuk
privacy mode):

```js
try {
  const s = JSON.parse(localStorage.getItem('budgetku_state') || '{}');
  if (s.darkMode) document.documentElement.setAttribute('data-theme', 'dark');
} catch {}
```

---

# Part 3 — Navigasi

## 3.1 Sidebar Desktop

```css
.sidebar {
  width: 240px;                       /* 68px saat collapsed */
  background: var(--sidebar-bg);      /* #0e1626 light / #080e18 dark */
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  transition: width .25s ease, background .2s;
}
```

### 3.1.1 Branding

```
┌──────────────────────────────────────┐
│ [logo 34px]  BudgetX                 │  padding 20px 16px 16px
│               Money Tracker          │  border-bottom 1px rgba(255,255,255,.07)
│                              [‹]     │  collapse toggle 28×28
└──────────────────────────────────────┘
```

| Elemen | Nilai |
|---|---|
| `.logoMark` | 38×38, radius 10, `overflow:hidden`, berisi `<img src="/logo.png" 34×34 object-fit:contain>` |
| `.brandName` | `BudgetX` — 14px/700/`#fff` |
| `.brandSub` | `Money Tracker` — 11px/`rgba(255,255,255,0.45)` |
| `.collapseBtn` | 28×28, radius 6, border `1px rgba(255,255,255,0.1)`, chevron SVG 16px `strokeWidth 2`, `transform: rotate(180deg)` saat collapsed, `transition: transform .2s` |

`aria-label`/`title`: `Expand sidebar` (collapsed) / `Collapse sidebar` (expanded) —
**bahasa Inggris**, lihat Part 8.11.

### 3.1.2 Nav Items — 11, urutan persis

Tidak ada grouping, header, atau divider. Satu container `.nav` (`padding: 8px 0`).

| # | `id` | Label (verbatim) | `NavIcon` | Glyph lucide |
|---|---|---|---|---|
| 1 | `dashboard` | `Dashboard` | `dashboard` | `Home` |
| 2 | `wallet` | `Dompet` | `wallet` | `Wallet` |
| 3 | `tx` | `Transaksi` | `tx` | `Receipt` |
| 4 | `budget` | `Budget` | `budget` | `PieChart` |
| 5 | `recurring` | `Berkala` | `recurring` | `RefreshCcwDot` |
| 6 | `subscription` | `Langganan` | `subscription` | `CreditCard` |
| 7 | `debt` | `Utang/Piutang` | `debt` | `Handshake` |
| 8 | `invest` | `Investasi` | `invest` | `Activity` |
| 9 | `asset` | `Aset` | `asset` | `ShieldCheck` |
| 10 | `report` | `Laporan` | `report` | `ClipboardList` |
| 11 | `settings` | `Pengaturan` | `settings` | `Settings` |

> **`fire` dan `help` tidak punya item sidebar.**FIRE hanya dari Dashboard (mobile) dan
> Pengaturan → Alat Keuangan. Bantuan hanya dari Pengaturan dan dropdown mobile.

### 3.1.3 Styling Item

```css
.navItem {
  width: calc(100% - 20px); margin: 2px 10px;
  padding: 10px 16px; border-radius: 12px;
  display: flex; align-items: center; gap: 10px;
}
.navItem:hover      { background: rgba(255,255,255,0.06); }
.navItemActive      { background: rgba(79,110,247,0.15); }
.navIcon            { color: rgba(255,255,255,0.5); }
.navIconActive      { color: #4F6EF7; }
.navLabel           { color: rgba(255,255,255,0.5); font-weight: 400; font-size: 13.5px; }
.navLabelActive     { color: #fff; font-weight: 600; }
```

Mode collapsed: hanya ikon, `title={item.label}` sebagai tooltip.

### 3.1.4 Footer

`margin-top: auto; padding: 12px 14px; border-top: 1px rgba(255,255,255,0.07)`

**1. User block** (hanya saat `user && !collapsed`)

| Elemen | Nilai |
|---|---|
| `.userEmail` | `user.email` mentah, 11px, `rgba(255,255,255,0.5)`, ellipsis, `title={user.email}` |
| `.logoutBtn` | 26×26, radius 6, SVG logout 16px, `title="Keluar"`, hover `color:#EF4444` di `rgba(239,68,68,0.1)` |

Tanpa avatar, tanpa nama tampilan, tanpa header "Account".

**2. Theme toggle** (`.themeToggle`)

```css
.themeToggle {
  width: 100%; display: flex; justify-content: space-between;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 8px 12px; margin-bottom: 12px;
}
.themeLabel { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.6); }
```

| State | Label | Ikon | Warna ikon |
|---|---|---|---|
| Light aktif | `Light Mode` | `sun` (Sun) | `rgba(255,255,255,0.6)` |
| Dark aktif | `Dark Mode` | `moon` (Moon) | `#FCD34D` |

> Label menyatakan **state tujuan**, bukan state sekarang. Saat collapsed, label
> disembunyikan dan ikon di-center; `title` berisi nama yang sama.

**3. Periode aktif** (hanya saat expanded)

| Elemen | Nilai |
|---|---|
| `.periodLabel` | `Periode Aktif` — 11px, `rgba(255,255,255,0.3)` |
| `.periodValue` | `new Date().toLocaleDateString('id-ID', {month:'long', year:'numeric'})` — 13px/600, `rgba(255,255,255,0.7)` |

> **Tidak terkait** dengan `cycleStart` / `periodMode` / custom range. Selalu bulan
> kalender berjalan. Lihat Part 8.13.

## 3.2 Mobile Top Bar

Hanya dirender **bila `user` truthy**. Pada mode lokal (tanpa akun) top bar tidak ada,
padahal bottom nav tetap tampil.

```css
.mobileTopBar {
  position: fixed; top: 0; left: 0; right: 0; height: 56px;
  background: rgba(17,24,39,0.85); backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 16px; z-index: 100;
}
```

| Posisi | Elemen | Nilai |
|---|---|---|
| Kiri | Logo | `<img src="/logo.png">` 28×28 |
| Kiri | `.mobileTopBrand` | `BudgetX` — 16px/700/`#fff` |
| Kanan | `.mobileAvatar` | 34×34 circle, `background: rgba(79,110,247,0.2)`, `color: #4F6EF7`, `border: 2px solid rgba(79,110,247,0.3)`, 14px/700, isi = `user.email?.charAt(0).toUpperCase() \|\| 'U'` |

### Avatar Dropdown

```css
.mobileDropdown {
  position: absolute; top: 52px; right: 16px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.2);
  padding: 8px; min-width: 220px; z-index: 200;
}
```

Isi, berurutan:

| # | Item | Ikon | `setPage` |
|---|---|---|---|
| — | `.mobileDropdownEmail` — `user.email` mentah, 12px `--text-4`, border-bottom | — | — |
| 1 | `Dompet` | `wallet` | `wallet` |
| 2 | `Budget` | `budget` | `budget` |
| 3 | `Berkala` | `recurring` | `recurring` |
| 4 | `Langganan` | `subscription` | `subscription` |
| 5 | `Utang/Piutang` | `debt` | `debt` |
| 6 | `Investasi` | `invest` | `invest` |
| — | `.mobileDropdownDivider` — 1px `--border-2` | — | — |
| 7 | `Bantuan` | ⚠️ **`settings`** | `help` |
| 8 | `Light Mode` / `Dark Mode` | `sun`/`moon` | toggle |
| 9 | `Keluar` | logout SVG | — (warna `#DC2626`) |

> ⚠️ Item `Bantuan` memakai ikon `settings` (gear) — bukan ikon help. Lihat Part 8.12.

**Cakupan halaman di mobile:** bottom nav (4) + dropdown (6+1) = `dashboard, tx, report,
settings, wallet, budget, recurring, subscription, debt, invest, help`. **`asset` dan
`fire` tidak terjangkau** dari chrome mobile.

## 3.3 Mobile Bottom Nav — 5 Slot

```css
.bottomNav {
  display: none;
  /* ≤768px */
  display: flex; position: fixed; bottom: 0; left: 0; right: 0;
  height: 64px; background: var(--sidebar-bg);
  border-top: 1px solid rgba(255,255,255,0.06);
  z-index: 100; justify-content: space-around; align-items: center;
  padding: 0 8px; backdrop-filter: blur(12px);
}
.bottomNavItem {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  min-width: 44px; min-height: 44px; padding: 6px 8px;
  color: rgba(255,255,255,0.45);
}
.bottomNavItemActive { color: #4F6EF7; }
.bottomNavLabel { font-size: 10px; font-weight: 500; }
```

| Slot | `id` | Label | Ikon | Ukuran |
|---|---|---|---|---|
| 1 | `dashboard` | `Dashboard` | `dashboard` | 20px |
| 2 | `tx` | `Transaksi` | `tx` | 20px |
| **3** | **`__fab__`** | *(kosong)* | **FAB +** | 24px SVG `strokeWidth 2.5` |
| 4 | `report` | `Laporan` | `report` | 20px |
| 5 | `settings` | `Pengaturan` | `settings` | 20px |

### FAB

```css
.fab {
  width: 52px; height: 52px; border-radius: 50%;
  background: #4F6EF7; color: #fff; border: none;
  position: relative; top: -16px; margin: 0 4px;
  box-shadow: 0 4px 16px rgba(79,110,247,0.4), 0 2px 6px rgba(79,110,247,0.2);
}
.fab:hover { transform: scale(1.05); }
```

- Ikon: SVG plus inline 24px, stroke `12 5 → 12 19` dan `5 12 → 19 12`
- `aria-label="Tambah Transaksi"`
- `onClick` → `onAddTx` → membuka `TxFormModal` global (lihat Part 6.3)

### Landscape (≤768px dan `max-height: 500px`)

```css
.bottomNav { height: 52px; }
.fab { width: 44px; height: 44px; top: -10px; }
.appMain > * { padding-bottom: 60px; }
```

## 3.4 Offset Shell di Mobile

`≤768px`, konten `.appMain > *` diberi:

```css
padding-block: 72px 80px;                        /* 56px topbar + 64px bottomnav */
padding-inline: var(--container-gutter-phone);   /* 16px */
```

## 3.5 Model Theme

| Aspek | Nilai |
|---|---|
| Sumber kebenaran | State boolean `darkMode` di `App.jsx` (default `false`) |
| Mekanisme | `document.documentElement.setAttribute('data-theme','dark')` / `.removeAttribute` |
| Tidak ada | `prefers-color-scheme`, sinkronisasi dengan OS |
| Persistensi (cloud) | `api.updatePreferences({ darkMode, … })`, debounce 300ms |
| Persistensi (lokal) | field `darkMode` di dalam blob `localStorage['budgetku_state']` |
| FOUC guard | Script inline di `index.html` (Part 2.9) |
| Transisi | blanket `*` transition background/border 300ms, color 200ms |
| Lokasi toggle | ① footer Sidebar ② dropdown mobile ③ *(Settings menerima `preferences` tapi tidak punya setter)* |

> `ThemeContext` sengaja **tidak** inject custom property inline. Ada test yang menjaga
> perilaku ini.

## 3.6 Preferensi yang Dipersistensi

`App.jsx` menyimpan dan auto-persist (debounce 300ms):

```js
savePreferences({ darkMode, cycleStart, salaryAdjust, page, periodMode, customRanges })
```

Penyimpanan FIRE settings terpisah di `users/{uid}/preferences/fire`.

> `page` ikut dipersistensi → halaman terakhir yang dibuka dipulihkan saat reload.

---

# Part 4 — Komponen Inti

Semua di `src/components/`.

## 4.1 `Modal` — Pondasan seluruh form

`src/components/Modal/Modal.jsx` (43 baris) + `Modal.module.css` (80 baris).

### Props

| Prop | Tipe | Default | Keterangan |
|---|---|---|---|
| `title` | string | — | Judul di header |
| `onClose` | fn | — | Dipanggil dari 3 jalur (lihat bawah) |
| `children` | node | — | Konten; **tombol action dirender di dalam body**, bukan slot terpisah |
| `width` | number | `480` | Diterapkan sebagai `maxWidth` inline |

### Struktur DOM

```
div.overlay  (fixed inset-0, z-index 1000)
└── div.modal  (maxWidth: width, max-height 90vh, flex column)
    ├── div.header
    │   ├── span.title
    │   └── button.closeBtn  aria-label="Close"   → <NavIcon name="close" size={18}/>
    └── div.body  (padding 24, overflow-y auto, flex 1)
        └── {children}
```

### Styling

```css
.overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.modal {
  width: 100%; border-radius: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-2);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  max-height: 90vh;
  display: flex; flex-direction: column;
}
.header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}
.title  { font-size: 16px; font-weight: 700; color: var(--text-1); }
.closeBtn { background: none; border: none; padding: 6px;
            color: var(--text-4); border-radius: 8px; }
.closeBtn:hover { background: var(--bg-3); }
.body { padding: 24px; overflow-y: auto; flex: 1; }
```

### Tiga Jalur Penutupan

1. **Escape** — `useEffect` memasang listener `keydown` di `document`; `if (e.key === 'Escape') onClose()`.
2. **Klik backdrop** — `onClick={e => e.target === e.currentTarget && onClose()}` pada `.overlay`;
   `.modal` memanggil `e.stopPropagation()`.
3. **Tombol ✕** — langsung `onClose`.

### ⚠️ Yang TIDAK Ada (jangan diasumsikan)

- Tidak ada focus trap
- Tidak ada scroll lock pada `<body>`
- Tidak ada `role="dialog"`, `aria-modal`, atau `aria-labelledby`
- Tidak ada autofocus otomatis
- Tidak ada portal (dirender in-place, sehingga mewarisi konteks `overflow`/`transform` leluhur)
- Tidak ada proteksi Escape berlapis — modal bertumpuk akan tertutup semua

> Modul yang butuh autofocus menambahkannya manual (mis. input kategori di Pengaturan
> pakai `autoFocus`).

### Ukuran yang Dipakai

| `width` | Dipakai oleh |
|---|---|
| 400 | `UpdateValueModal`, `PayModal`, `IncomeModal` |
| 420 | `CycleSettingModal` |
| 440 | `TransferModal`, `RepurchaseModal`, `ResetConfirmModal`, `DataMigrator`, `PaymentModal` |
| 460 | `PeriodModal`, `PeriodTransitionModal`, `BuyModal`, `SellModal` |
| 480 *(default)* | `ImportConfirmModal`, `SubscriptionFormModal`, dan semua modal lain yang tidak override |
| 500 | `RecurringFormModal` |
| 520 | `DebtFormModal`, `InvestmentFormModal` |
| 540 | `SectionEditModal` |

### Responsive

```css
@media (max-width: 768px) {
  .overlay { padding: 8px; }
  .modal  { width: 92vw !important; max-width: 92vw !important; max-height: 85vh; }
  .header { padding: 16px 16px 12px; }
  .body   { padding: 16px; }
}
```

> `!important` menimpa inline `maxWidth`, jadi prop `width` **diabaikan di ponsel**.

## 4.2 `Field` — Pembungkus Form

`src/components/ui/Field.jsx` (37 baris). Props: `{ label, children, error }`.

```jsx
<div style={{ marginBottom: 16 }}>
  <label style={{
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--text-4)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.04em'
  }}>{label}</label>
  {children}
  {error && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
</div>
```

**Konvensi label: HURUF BESAR.** Semua label form tampil kapital dari CSS, teks sumber
biasanya Title Case (`Nama Dompet` → tampil `NAMA DOMPET`).

## 4.3 `Input` dan `Select`

`src/components/ui/Input.jsx` (32 baris), `Select.jsx` (35 baris) — **inline style
identik**:

```js
{
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--border)', borderRadius: 12,
  fontSize: 14, color: 'var(--text-1)', background: 'var(--bg-2)',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 0.15s, background 0.2s'
}
```

- `style` prop caller **ditimpa setelah** default → custom style menang, base tetap ada
  (ada test yang menjaga perilaku merge ini).
- `Select` mendapat chevron SVG global dari `App.css` (`appearance:none` + data-URI).
- `≤768px`: `min-height: 44px; border-radius: 12px` dari global `App.css`.

## 4.4 `AmountText` — Nominal Transaksi

`src/components/ui/AmountText.jsx` (47 baris). Props: `{ type, amount, size = 14 }`.

| `type` | Prefix | Warna |
|---|---|---|
| `income` | `+` | `var(--amount-income, #16A34A)` |
| `expense` | `-` | `var(--amount-expense, #DC2626)` |
| `transfer` | `↔` | `var(--amount-transfer, #4F46E5)` |

Render: `fmtFull(amount)`, `fontWeight: 600`, `fontSize: size`,
`fontVariantNumeric: 'tabular-nums'`.

> ⚠️ Ketiga var `--amount-*` **tidak pernah dideklarasikan** → selalu jatuh ke fallback hex.
> Lihat Part 8.6.

## 4.5 `TxBadge` — Badge Tipe Transaksi

`src/components/ui/TxBadge.jsx` (51 baris).

| `type` | Teks | Background | Warna |
|---|---|---|---|
| `income` | `Pemasukan` | `var(--tx-badge-income-bg, rgba(22,163,74,0.1))` | `var(--tx-badge-income-color, #065F46)` |
| `expense` | `Pengeluaran` | `var(--tx-badge-expense-bg, rgba(220,38,38,0.1))` | `var(--tx-badge-expense-color, #991B1B)` |
| `transfer` | `Transfer` | `var(--tx-badge-transfer-bg, rgba(99,102,241,0.1))` | `var(--tx-badge-transfer-color, #3730A3)` |

Styling: `borderRadius: 6px; padding: '2px 8px'; fontSize: 11px; fontWeight: 600`.
Type tak dikenal → fallback ke `expense`.

> ⚠️ **Komponen ini praktis tidak dipakai** — halaman Transactions merender badge-nya
> sendiri dengan class CSS Module.

## 4.6 `ProgressBar`

`src/components/ui/ProgressBar.jsx` (47 baris). **Div murni, bukan SVG.**

| Prop | Default | Keterangan |
|---|---|---|
| `value` | — | Nilai sekarang |
| `max` | — | Nilai maksimum |
| `color` | `#4F6EF7` | Warna fill |
| `height` | `6` | Tinggi track (px) |
| `showOverflow` | `false` | Jika `true` dan `value > max`, bar jadi `#EF4444` |

```js
pct   = max > 0 ? Math.min(value / max * 100, 100) : 0;
color = (showOverflow && value > max) ? '#EF4444' : color;
```

Styling: track `background: var(--bg-3)`, `borderRadius: 99px`, `overflow: hidden`;
fill `height: 100%`, `borderRadius: 99px`, `transition: width 0.8s ease-out`.

## 4.7 `MultiChip` — Filter Chip Multi-Pilih

`src/components/ui/MultiChip.jsx` (80 baris). Props:
`{ options, selected: Set, onChange, allLabel = 'Semua' }`.

```css
Wrapper : display flex; flex-wrap wrap; gap 6px
Chip    : padding 4px 12px; border-radius 99px; border 1.5px solid;
          font-size 12px; font-weight 600; white-space nowrap
Aktif   : border-color & color = opt.color || '#4F6EF7';
          background = (opt.color || '#4F6EF7') + '18'   /* 9% alpha */
Nonaktif: border var(--border); background var(--bg-card); color var(--text-4);
          font-weight 400
Chip "Semua" aktif saat selected.size === 0
```

**Perilaku khusus:** memilih **semua** opsi akan me-reset `selected` ke empty set
(back to "Semua") — bukan menandai semua.

## 4.8 `CategoryPicker`

`src/components/ui/CategoryPicker.jsx` (126 baris) + `CategoryPicker.module.css` (204 baris).
Grid pill emoji yang bisa dipilih (kategori transaksi). Dipakai di `TxFormModal`.

## 4.9 `NavIcon` — Peta Ikon

`src/components/icons/NavIcon.jsx` (77 baris). Wrapper atas `lucide-react`,
default `strokeWidth: 2` (`plus`, `close`, `check` = `2.5`).

| `name` | Glyph lucide |
|---|---|
| `dashboard` | `Home` |
| `wallet` | `Wallet` |
| `tx` | `Receipt` |
| `budget` | `PieChart` |
| `report` | `ClipboardList` |
| `plus` | `Plus` |
| `close` | `X` |
| `chevron` | `ChevronRight` |
| `arrow` | `ArrowRight` |
| `filter` | `Filter` |
| `search` | `Search` |
| `edit` | `Pencil` |
| `trash` | `Trash2` |
| `transfer` | `ArrowUpDown` |
| `warning` | `AlertTriangle` |
| `check` | `Check` |
| `income` | `TrendingUp` |
| `expense` | `TrendingDown` |
| `sun` | `Sun` |
| `moon` | `Moon` |
| `recurring` | `RefreshCcwDot` |
| `debt` | `Handshake` |
| `invest` | `Activity` |
| `asset` | `ShieldCheck` |
| `fire` | `Flame` |
| `subscription` | `CreditCard` |
| `settings` | `Settings` |

`name` tak dikenal → return `null` (tidak ada fallback).

## 4.10 `WalletIcon` — SVG Buatan Sendiri

`src/components/ui/WalletIcon.jsx` (46 baris). Inline SVG `viewBox="0 0 24 24"`,
`stroke="currentColor"`, `strokeWidth: 1.8`, prop `{ size = 24 }`.

| `type` | Bentuk |
|---|---|
| `bank` | Atap pediment klasik |
| `ewallet` | Rounded rect + `M16 12h2` |
| `credit` | Kartu + stripe + `M7 15h2` |
| `paylater` | Lingkaran + tangan jam |
| `cash` | Uang kertas + lingkaran + dua titik |

Type tak dikenal → fallback `bank`.

## 4.11 Empat Chart Buatan Sendiri

`src/components/charts/` — **tidak ada recharts, tidak ada CSS Module, inline style saja.**

> Recharts hanya dipakai di satu tempat: `FirePage` (lihat Part 6.11).

### 4.11.1 `PieChart` — Donut

`PieChart.jsx` (68 baris). Props: `{ slices: [{label, value, color}], size = 180 }`.

```js
total  = Σ slice.value
r      = size/2 - 8
inner  = r * 0.55          /* lubang donut 55% */
start  = -Math.PI/2       /* mulai dari jam 12 */
```

Path tiap slice:
```
M inner-start L outer-start A r,r 0 large,1 outer-end L inner-end A inner,inner 0 large,0 inner-start Z
```

- Separator: `<path fill={color} stroke="white" strokeWidth="2" />`
  ⚠️ `white` hardcoded → **seam putih di dark mode** (Part 8.9).
- Akumulasi sudut memakai `reduce` (bukan mutasi array di `.map()`) — trigger ESLint
  `react-hooks/immutability` sudah diperbaiki.
- **Teks di tengah:** `Total` (11px, `var(--text-5)`) di `cy-6`, lalu `fmt(total)`
  (13px, weight 700, `var(--text-1)`) di `cy+10`.
- **Empty state:** `Tidak ada data` — div center, `padding: '24px 0'`,
  `color: var(--text-6)`, 13px.
- Wrapper: `<div style="display:flex; justify-content:center">` +
  `<svg width={size} height={size}>` (tidak responsif).
- Tidak ada hover, tooltip, atau legend di dalam komponen (legend di luar, di Laporan).

### 4.11.2 `CompareBarChart` — 3 Bar Vertikal

`CompareBarChart.jsx` (80 baris). Props: `{ a, b, prev }`, masing-masing
`{ label, value, color }`.

```js
max    = Math.max(a.value, b.value, prev.value, 1)
W=320, H=220, padTop=32, padBot=32, barH = H - padTop - padBot
bw = 52, gap = 24, startX = (W - totalBarsWidth)/2   /* dipusatkan */
```

- Bar ketiga (`prev`) selalu `dim: true` → `fillOpacity: 0.45`.
- Dua garis bantu: `y=padTop` (`stroke: var(--border-2)`) dan `y=H-padBot` (`var(--border)`).
- `<rect rx="6" fill={bar.color} fillOpacity={dim ? .45 : 1}>`;
  `bh = Math.max(0, (value/max)*barH)`, minimal 4px bila `value > 0`.
- Label nilai di atas bar (11px/700, `fill` = warna bar atau `--text-5` bila dim),
  hanya tampil bila `value > 0`, isi `fmt(value)`.
- Label kategori di `y = H - 8` (10px, `var(--text-5)`).
- Root: `<svg width="100%" viewBox="0 0 320 220" style="maxHeight:240">` — responsif.

### 4.11.3 `MonthCompareBar` — 2 Bar Horizontal

`MonthCompareBar.jsx` (66 baris). Props: `{ current, prev, curLabel, prevLabel }`.
Warna **hardcoded**: current `#EF4444`, previous `#FCA5A5`.

```
Label  : 12px var(--text-4), width 52px, flexShrink 0
Track  : flex 1, background var(--bg-3), borderRadius 99, height 10, overflow hidden
Fill   : width (v/max)*100%, height 100%, borderRadius 99, transition width .4s
Value  : 12px/700, color = warna bar, width 62px, textAlign right, tabular-nums
```

### 4.11.4 `DailyBarChart` — Bar Harian

`DailyBarChart.jsx` (91 baris). Props: `{ data, max, days, cycleStart }`.

```js
H = 100, barW = 22, gap = 4
totalW = Math.max(data.length * (barW + gap), 580)
svg height = H + 30
bar height = max > 0 ? (v/max) * (H - 14) : 0
```

**Lapis warna bar:**

| Kondisi | Warna |
|---|---|
| Tanggal = hari ini | `#4F6EF7` |
| `v > max * 0.7` | `#EF4444` |
| `v > max * 0.4` | `#F59E0B` |
| selainnya | `var(--text-6)` |

**Penanda siklus:** saat `day === cycleStart`, gambar garis vertikal putus-putus
`<line stroke="#4F6EF7" strokeWidth="1" strokeDasharray="3,2" opacity="0.5">`
dari `y 0` ke `y H`; label X-nya jadi `#4F6EF7` / weight 700.

**Label sumbu X** hanya dirender bila `day === 1 || day % 5 === 0 || isCyc` —
9.5px, isi = tanggal dalam bulan.

**Legenda** (hanya bila `cycleStart > 1`), 11px `var(--text-5)`:
```
│ = hari mulai siklus (tgl {cycleStart})
```
`│` adalah U+2502, warnanya `#4F6EF7` weight 600.

- `<rect rx="3" fill={color} fillOpacity={0.9}>`, hanya dirender bila `bh > 0`
- Wrapper `overflowX: 'auto'` → chart bisa di-scroll horizontal
- Tidak ada y-axis, label nilai, tooltip, atau empty state

## 4.12 `HelpChat` — Asisten Virtual

`src/components/HelpChat/HelpChat.jsx` (155 baris) + `HelpChat.module.css` (225 baris).

> **Bukan AI. Tidak ada network call, tidak ada analytics, tidak ada persistensi.**
> 10 FAQ hardcoded. Tanpa input teks.

### 4.12.1 FAB (Floating Action Button)

```css
.floatingBtn {
  position: fixed; bottom: 24px; right: 24px;
  width: 48px; height: 48px; border-radius: 50%;
  background: #4F6EF7; color: #fff; border: none;
  z-index: 9998;
  box-shadow: 0 4px 16px rgba(79,110,247,0.4), 0 2px 6px rgba(79,110,247,0.2);
  transition: transform .2s, box-shadow .2s;
}
.floatingBtn:hover { transform: scale(1.08); }
```

- `aria-label="Bantuan"`, `title="Bantuan"`
- Ikon tertutup: help-circle SVG 22px `strokeWidth 2.5`
- Ikon terbuka: X SVG 22px `strokeWidth 2.5`
- **Fungsi ganda:** toggle buka/tutup
- **Mobile `≤768px`:** `bottom: 80px; right: 16px`

> ⚠️ Berada di sudut yang sama dengan toast (`bottom:24 right:24`, `z-index:9999`) —
> toast akan menutupi FAB saat keduanya tampil.

### 4.12.2 Panel

```css
.panel {
  position: fixed; bottom: 84px; right: 24px;
  width: 360px; max-height: 480px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 16px; z-index: 9998;
  display: flex; flex-direction: column; overflow: hidden;
  animation: fadeInUp .25s ease-out;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08);
}
/* Mobile ≤768px */
.panel { bottom: 140px; right: 12px; left: 12px; width: auto; max-height: 420px; }
```

**Header** (`.panelHeader`, `background:#4F6EF7`, `color:#fff`, padding `14px 16px`):

| Elemen | Isi |
|---|---|
| `.botAvatar` | `🤖` 24px |
| `.panelTitle` | `Bantuan BudgetX` — 14px/700 |
| `.panelSubtitle` | `Asisten virtual` — 11px, `opacity:.8` |
| `.closeBtn` | 30×30 circle, `background: rgba(255,255,255,0.15)`, X SVG 18px, `aria-label="Tutup bantuan"` |

**Pesan** (`.messages`, `flex:1; overflow-y:auto; padding:16px; gap:12px;
`min-height:180px; max-height:280px`; mobile `max-height:220px`):

```
Bot  : div.botMessage → span.msgAvatar 🤖 18px + div.botBubble
User : div.userMessage (justify-content: flex-end) → div.userBubble
```

| Bubble | Background | Border-radius | Teks |
|---|---|---|---|
| `.botBubble` | `var(--bg-3)` | 12px (`border-top-left-radius: 4px`) | 13px `var(--text-2)` |
| `.userBubble` | `#4F6EF7` | 12px (`border-top-right-radius: 4px`) | 13px `#fff` |

Keduanya: `padding: 10px 14px; max-width: 85%; word-break: break-word; border: 1px solid var(--border-2)`.

**Quick actions** (`.quickActions`, padding `12px 16px`, border-top, `background: var(--bg-2)`):
10 `.quickBtn` pill, `border-radius: 20px`, `padding: 6px 12px`, `1px var(--border)`,
`background: var(--bg-card)`, `color: var(--text-3)`, 11.5px/500;
hover → border + background `#4F6EF7` + color `#fff`.

### 4.12.3 Perilaku

| Aspek | Nilai |
|---|---|
| State | `open` (bool), `messages` (array `{type:'user'\|'bot', text}`) |
| Buka | Set `open=true`; greeting **hanya** bila `messages.length === 0` |
| Tutup | Transkrip **dipertahankan**; buka lagi tidak menyapa ulang |
| Klik chip | Append 2 pesan: pertanyaan (user) lalu jawaban (bot). Klik berulang = duplikasi bertumpuk |
| Escape | ❌ tidak menutup |
| Klik luar | ❌ tidak menutup |
| Auto-scroll | ❌ tidak ada |
| Input teks | ❌ tidak ada sama sekali |

**Greeting (pesan bot pertama), verbatim:**
```
Halo! 👋 Saya asisten BudgetX. Pilih topik di bawah atau tanyakan sesuatu tentang aplikasi ini.
```

### 4.12.4 FAQ — 10 Pasangan Tanya-Jawab (verbatim)

| # | `id` | Chip (pertanyaan) | Jawaban |
|---|---|---|---|
| 1 | `add-tx` | `Cara tambah transaksi` | `Klik tombol + (biru) di bottom bar, atau buka menu Transaksi lalu klik "Tambah". Pilih tipe (Pengeluaran/Pemasukan/Transfer), isi jumlah, pilih kategori dan dompet, lalu simpan.` |
| 2 | `budget` | `Cara atur budget` | `Buka menu Budget → klik "Atur Pemasukan" untuk set pendapatan bulanan → klik "Edit" di setiap seksi (Kebutuhan/Keinginan/Tabungan) untuk mengalokasikan per kategori. Gunakan panduan 50/30/20 sebagai acuan.` |
| 3 | `recurring` | `Apa itu Barang Berkala?` | `Barang Berkala adalah fitur untuk tracking item yang dibeli secara berkala (skincare, shampo, pasta gigi, dll). BudgetX menghitung biaya bulanan sebenarnya (amortized cost) dan mengingatkan kapan harus beli ulang.` |
| 4 | `debt` | `Cara catat utang/piutang` | `Buka menu Utang/Piutang → klik Tambah → pilih tipe (Utang = saya pinjam, Piutang = saya pinjamkan) → isi nama orang dan jumlah. Untuk mencicil, klik "Bayar" pada card utang. Bisa juga aktifkan bunga anuitas untuk pinjaman berbunga.` |
| 5 | `invest` | `Cara tracking investasi` | `Buka menu Investasi → klik Tambah → pilih jenis aset (Deposito, Saham, Crypto, Emas, dll) → isi detail. Untuk mencatat pembelian/penjualan, klik tombol "Beli" atau "Jual" pada card investasi.` |
| 6 | `fire` | `Apa itu FIRE Calculator?` | `FIRE (Financial Independence, Retire Early) Calculator membantu merencanakan kapan Anda bisa pensiun dini. Masukkan data keuangan dan lihat proyeksi pertumbuhan portofolio dengan 3 skenario berbeda.` |
| 7 | `export` | `Cara export data` | `Buka Pengaturan → scroll ke bagian "Ekspor Data" → pilih format JSON (backup lengkap) atau CSV (spreadsheet). File akan terdownload ke perangkat Anda.` |
| 8 | `theme` | `Cara ganti tema` | `Desktop: klik tombol Dark/Light Mode di sidebar bawah. Mobile: tap avatar di pojok kanan atas → pilih Dark Mode/Light Mode dari menu dropdown.` |
| 9 | `reset` | `Cara reset data` | `⚠️ Hati-hati! Reset akan menghapus SEMUA data. Buka Pengaturan → scroll ke bawah → klik "Reset Data" → ketik "RESET" untuk konfirmasi. Pastikan export data dulu sebelum reset.` |
| 10 | `contact` | `Hubungi developer` | `BudgetX dikembangkan oleh tim BudgetX. Untuk pertanyaan, saran, atau laporan bug, hubungi kami melalui GitHub: github.com/ekadinataa/budgetku` |

> ⚠️ Kata `RESET` di #9 **konflik** dengan `ResetConfirmModal` yang mewajibkan `Delete`.
> Lihat Part 8.10.

## 4.13 `DataMigrator` — Prompt Migrasi Lokal → Cloud

`src/components/DataMigrator.jsx` (137 baris). Tanpa CSS Module.

### Kapan tampil

```
!IS_LOCAL_MODE && user && !authLoading && !migrationChecked
&& localStorage['budgetku_state'] ada
```

Dihitung sebagai **state turunan** (bukan disimpan). Full-viewport, app shell tidak
di-mount.

### Isi Modal

`<Modal title="Migrasi Data Lokal" onClose={handleDecline} width={440}>`

**Paragraf (14px `var(--text-2)`, line-height 1.6, mb 16):**
```
Kami menemukan data BudgetX yang tersimpan di perangkat ini. Apakah Anda ingin memindahkan data tersebut ke akun Anda?
```

**Panel hitungan** (`background: var(--bg-3)`, radius 10, padding `12px 16px`, 13px,
`lineHeight 1.8`), 4 baris:
```
{walletCount} dompet
{txCount} transaksi
{catCount} kategori
{budgetCount} budget bulanan
```

**Error** (`rgba(239,68,68,0.08)` / border `rgba(239,68,68,0.2)`, radius 8,
`#EF4444`, 13px). Fallback: `Gagal migrasi data. Coba lagi.`

**Dua tombol** (flex, gap 10, rata kanan):

| Tombol | Style | Efek |
|---|---|---|
| `Lewati` | Ghost: border `1.5px var(--border)`, bg `var(--bg-card)`, `var(--text-3)`, 14px/500 | `localStorage.removeItem(STORAGE_KEY)` + `onComplete()` — **destruktif, data lokal dihapus permanen**. Ini juga jalur `onClose` (✕ / Escape / backdrop). |
| `Pindahkan Data` | Primary: `background:#4F6EF7`, `#fff`, 14px/600 | `migrateData({wallets, transactions, budgets, categories})` → hapus key → `onComplete()`. Label busy: `Memindahkan...` |

> ⚠️ `onClose` (Lewati / ✕ / Escape) **tidak** di-gate saat `migrating` — user bisa
> membatalkan di tengah proses. Lihat Part 8.14.

## 4.14 `DataMigrator` — ⚠️ Render-Phase Side Effect

Komponen membaca `localStorage` **saat render** dan memanggil `onComplete()` bila tidak
ada data. Ini anti-pattern React yang sudah diketahui — lihat Part 8.14.

---

# Part 5 — Autentikasi

Berkas: `src/pages/Auth/` — `LoginPage.jsx` (101), `RegisterPage.jsx` (124),
`ForgotPasswordPage.jsx` (80), `Auth.module.css` (131).

> **Penting:** ketiga halaman memakai **kartu tengah yang polos**. **Tidak ada** layout
> split hero, tidak ada ilustrasi, tidak ada panel gradient, tidak ada daftar fitur,
> tidak ada testimonial.|width| 420px.

## 5.1 Shell Kartu (bersama ketiga halaman)

```css
.authWrapper {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: 24px;
}
.authCard {
  max-width: 420px; width: 100%;
  padding: 40px 36px;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.08);
}
```

| Elemen | Nilai |
|---|---|
| `.logo` | Center, gap 10, margin-bottom 32 |
| `.logoImg` | `<img src="/logo.png">` 40×40, radius 10 |
| `.logoText` | `BudgetX` — 20px/700 |
| `.title` | 22px/700, center, margin-bottom 6 |
| `.subtitle` | 14px `var(--text-4)`, center, margin-bottom 28 |

## 5.2 Tombol & Link (bersama)

```css
.submitBtn {
  width: 100%; padding: 12px; border-radius: 10px; border: none;
  background: #4F6EF7; color: #fff;
  font-size: 15px; font-weight: 600; margin-top: 8px;
}
.submitBtn:hover:not(:disabled) { background: #3b5de7; }
.submitBtn:disabled { opacity: 0.6; cursor: not-allowed; }

.links { margin-top: 20px; text-align: center; font-size: 13px; color: var(--text-4); }
.link  { color: #4F6EF7; font-size: 13px; font-weight: 500; }
.link:hover { text-decoration: underline; }
```

## 5.3 `LoginPage` — Masuk

| Elemen | String verbatim |
|---|---|
| `<h1>` | `Masuk` |
| Subtitle | `Masuk ke akun BudgetX Anda` |
| Label field 1 | `Email` |
| Placeholder 1 | `email@contoh.com` |
| Atribut | `type="email"`, `autoComplete="email"`, `required` |
| Label field 2 | `Password` |
| Placeholder 2 | `Masukkan password` |
| Atribut | `type="password"`, `autoComplete="current-password"`, `required` |
| Tombol submit | `Masuk` |
| Label tombol busy | `Memproses...` |
| Link kiri | `Lupa password?` → `authPage = 'forgot'` |
| Pemisah | `·` (U+00B7) |
| Link kanan | `Buat akun baru` → `authPage = 'register'` |

### Error Box

```css
.errorBox {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 8px; padding: 10px 14px;
  color: #EF4444; font-size: 13px;
}
```

### Mapping Error Firebase

| Kode | Pesan |
|---|---|
| `auth/user-not-found` · `auth/wrong-password` · `auth/invalid-credential` | `Email atau password salah.` |
| `auth/too-many-requests` | `Terlalu banyak percobaan. Coba lagi nanti.` |
| `auth/invalid-email` | `Format email tidak valid.` |
| default | `code \|\| 'Terjadi kesalahan. Coba lagi.'` |

## 5.4 `RegisterPage` — Daftar

| Elemen | String verbatim |
|---|---|
| `<h1>` | `Daftar` |
| Subtitle | `Buat akun BudgetX baru` |
| Field 1 | `Email` · placeholder `email@contoh.com` |
| Field 2 | `Password` · placeholder `Minimal 8 karakter` · `autoComplete="new-password"` |
| Field 3 | `Konfirmasi Password` · placeholder `Ulangi password` · `autoComplete="new-password"` |
| Tombol submit | `Daftar` |
| Label busy | `Memproses...` |
| Footer | `Sudah punya akun?` + link `Masuk` → `authPage = 'login'` |

### Validasi Client-Side

Ditampilkan sebagai prop `error` pada `Field` (inline di bawah input, **bukan** di
`.errorBox` atas):

| Kondisi | Pesan |
|---|---|
| `password.length < 8` | `Password minimal 8 karakter.` |
| `password !== confirmPassword` | `Password tidak cocok.` |

### Mapping Error Firebase

| Kode | Pesan |
|---|---|
| `auth/email-already-in-use` | `Email sudah terdaftar.` |
| `auth/invalid-email` | `Format email tidak valid.` |
| `auth/weak-password` | `Password terlalu lemah. Gunakan minimal 8 karakter.` |
| default | `code \|\| 'Terjadi kesalahan. Coba lagi.'` |

> Tidak ada field nama, tidak ada centang syarat, tidak ada meter kekuatan password.

## 5.5 `ForgotPasswordPage` — Reset Password

| Elemen | String verbatim |
|---|---|
| `<h1>` | `Reset Password` |
| Subtitle | `Masukkan email Anda untuk menerima link reset password` |
| Field | `Email` · placeholder `email@contoh.com` |
| Tombol submit | `Kirim Link Reset` |
| Label busy | `Mengirim...` |
| Link footer | `Kembali ke halaman masuk` → `authPage = 'login'` |

### Success Box

Setelah submit, form diganti `.successBox`:

```css
.successBox {
  background: rgba(34,197,94,0.08);
  border: 1px solid rgba(34,197,94,0.2);
  border-radius: 8px; padding: 10px 14px;
  color: #22C55E; font-size: 13px;
}
```

Isi:
```
Jika email terdaftar, link reset password telah dikirim. Periksa inbox Anda.
```

> Sukses ditampilkan **tanpa syarat** — `catch` kosong dengan komentar
> `// Always show success regardless of whether email exists`. Ini benar secara
> keamanan (tidak membocorkan apakah email terdaftar) tapi berarti tidak ada feedback
> error sama sekali.

---

# Part 6 — 13 Halaman

Setiap halaman dispesifikasikan dengan format yang sama:

1. **Header** — judul, subtitle, tombol aksi
2. **Urutan section** — urutan DOM dari atas ke bawah
3. **Komponen** — layout, class, data yang ditampilkan
4. **Interaksi** — apa yang bisa diklik dan akibatnya
5. **State** — empty / loading / error
6. **Modal** — field, placeholder, validasi, label tombol
7. **Responsive** — apa yang berubah di `≤768px`
8. **Token** — warna yang dipakai

## 6.0 Ringkasan 13 Halaman

| `page` | Komponen | `<h1>` | Measure |
|---|---|---|---|
| `dashboard` | `Dashboard` | *(tidak ada `<h1>`)* | 1280px |
| `wallet` | `WalletPage` | `Dompet` | 1280px |
| `tx` | `TransactionsPage` | `Transaksi` | 1280px |
| `budget` | `BudgetPage` | `Budget` | 880px |
| `recurring` | `RecurringPage` | `Barang Berkala` | 880px |
| `subscription` | `SubscriptionPage` | `Langganan & Tagihan` | 880px |
| `debt` | `DebtPage` | `Utang/Piutang` | 880px |
| `invest` | `InvestmentPage` | `Investasi` | 880px |
| `asset` | `AssetPage` | `Kesehatan Keuangan` | 1280px |
| `report` | `ReportsPage` | `Laporan` | 1280px |
| `fire` | `FirePage` | `Kalkulator FIRE 🔥` | 1280px |
| `settings` | `SettingsPage` | `Pengaturan` | 880px |
| `help` | `HelpPage` | `Bantuan & Panduan` | 680px |

> **Inkonsistensi label (Part 8.13):** nav `Berkala` → halaman `Barang Berkala`;
> nav `Aset` → halaman `Kesehatan Keuangan`.

---

## 6.1 Dashboard

`src/pages/Dashboard/Dashboard.jsx` (556) + `Dashboard.module.css` (760)
+ `Calendar.jsx` (176), `StatCard.jsx` (33), `DebtWidget.jsx` (71), `InvestmentWidget.jsx` (55).

### 6.1.1 Header — Tidak Ada `<h1>`

Elemen paling atas adalah blok sapaan **khusus mobile** (`display:none` di desktop).

**Sapaan berdasarkan jam** (`Dashboard.jsx`):

| Jam | String |
|---|---|
| `< 11` | `Selamat Pagi 👋` |
| `< 15` | `Selamat Siang ☀️` |
| `< 18` | `Selamat Sore 🌅` |
| else | `Selamat Malam 🌙` |

Dirender: `{getGreeting()}{userName ? \`, ${userName}\` : ''}` dengan
`userName = user?.email ? user.email.split('@')[0] : ''`.
Sub-baris: **`Yuk, kelola keuanganmu hari ini`**

Styling: `.greeting` 18px/700 `var(--text-1)`, `animation: fadeInUp .3s ease-out`;
`.greetingSub` 13px `var(--text-4)`.

### 6.1.2 Urutan Section (DOM)

| # | Section | Visibility |
|---|---|---|
| 1 | Sapaan + sub | ≤768px |
| 2 | Hero card (total saldo) | ≤768px |
| 3 | Smart insight card | dua-duanya (conditional) |
| 4 | Quick menu | dua-duanya (layout berbeda) |
| 5 | Stat grid — 4× `StatCard` | **>768px saja** |
| 6 | `.mainGrid` (2 kolom) | dua-duanya |

### 6.1.3 Hero Card (mobile only)

```css
.heroCard {
  background: linear-gradient(135deg, #4F6EF7 0%, #3B5DE7 50%, #6366F1 100%);
  border-radius: 20px; padding: 20px; color: white;
  box-shadow: 0 8px 24px rgba(79,110,247,0.25);
  animation: fadeInUp .4s ease-out;
}
```

| Elemen | Isi | Styling |
|---|---|---|
| `.heroLabel` | `Total Saldo` | 13px/500, `opacity .85` |
| `.heroPeriod` | `toLocaleDateString('id-ID',{month:'long',year:'numeric'})` → `September 2026` | 11px, `bg rgba(255,255,255,0.15)`, radius 20px |
| `.heroValue` | `fmtFull(totalBalance)` | 26px/800, `tabular-nums`, `word-break: break-all` |
| `.heroSubCards` | grid `1fr 1fr`, gap 8 | — |
| `.heroSubCard` | `bg rgba(255,255,255,0.12)`, `backdrop-filter blur(8px)`, radius 12 | — |
| `.heroSubIcon` | 30×30 circle, 14px/700 | — |
| Row 1 | icon `↑` + label `Pemasukan` + `fmt(monthIncome)` | icon `rgba(34,197,94,0.15)` / `#22C55E` |
| Row 2 | icon `↓` + label `Pengeluaran` + `fmt(monthExpense)` | icon `rgba(239,68,68,0.15)` / `#EF4444` |

### 6.1.4 Smart Insight Card

Hanya tampil bila ada minimal satu transaksi pengeluaran bulan ini dengan kategori
yang bisa di-resolve.

```css
.insightCard {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: 12px; border-left: 3px solid #4F6EF7;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  font-size: 13px; color: var(--text-2);
  animation: fadeInUp .6s ease-out;
}
```

Isi: emoji **`💡`** + teks
```
Pengeluaran terbesarmu bulan ini: {topCat.name} ({fmtFull(topAmount)})
```

### 6.1.5 Quick Menu — 9 Tombol

Judul `Menu` (mobile saja; di desktop disembunyikan karena jadi rail).

| Urut | Label | `setPage` | `NavIcon` | Icon bg | Icon color |
|---|---|---|---|---|---|
| 1 | `Budget` | `budget` | `budget` | `rgba(79,110,247,0.12)` | `#4F6EF7` |
| 2 | `Berkala` | `recurring` | `recurring` | `rgba(168,85,247,0.12)` | `#A855F7` |
| 3 | `Langganan` | `subscription` | `subscription` | `rgba(168,85,247,0.12)` | `#A855F7` |
| 4 | `Utang` | `debt` | `debt` | `rgba(245,158,11,0.12)` | `#F59E0B` |
| 5 | `Investasi` | `invest` | `invest` | `rgba(34,197,94,0.12)` | `#22C55E` |
| 6 | `Dompet` | `wallet` | `wallet` | `rgba(236,72,153,0.12)` | `#EC4899` |
| 7 | `Laporan` | `report` | `report` | `rgba(6,182,212,0.12)` | `#06B6D4` |
| 8 | `Aset` | `asset` | `asset` | `rgba(6,182,212,0.12)` | `#06B6D4` |
| 9 | `FIRE` | `fire` | `fire` | `rgba(245,158,11,0.12)` | `#F59E0B` |

**Dua layout berbeda untuk `.quickMenuItem`:**

*Mobile (≤768px)* — grid 4 kolom:
```css
.quickMenuGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.quickMenuItem { flex-direction: column; justify-content: center;
                 padding: 12px 4px; border-radius: 14px;
                 border: 1px solid var(--border-2);
                 box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.quickMenuItem:active { transform: scale(.96); }
.quickMenuLabel  { font-size: 10px; font-weight: 600; ellipsis; }
.quickMenuIcon   { width: 36px; height: 36px; border-radius: 10px; }
```

*Desktop (≥769px)* — rail horizontal:
```css
.quickMenu { background: var(--bg-card); border: 1px solid var(--border);
             border-radius: var(--radius-lg); padding: var(--pad-tight) var(--pad-card);
             box-shadow: var(--elev-ring); }
.quickMenuGrid { display: flex; flex-wrap: nowrap; gap: var(--space-2);
                 overflow-x: auto; scrollbar-width: none; }
.quickMenuItem { flex: 1 1 0; flex-direction: row;
                 padding: var(--space-2) var(--space-3);
                 border: 1px solid transparent; border-radius: var(--radius-md);
                 background: transparent; }
.quickMenuItem:hover { background: var(--surface-warm); border-color: var(--border-soft); }
.quickMenuLabel { font-size: var(--text-sm); }
```

### 6.1.6 Stat Grid — 4 `StatCard`

`.statGrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }`
(`display: none` di ≤768px)

`StatCard` internal:

```css
.statAccentCircle  /* dekoratif: 70×70 circle, right:-10px top:-10px,
                      background: accent + '12' (12% alpha) */
.statLabel         /* 11px/600, var(--text-5), uppercase, letter-spacing .04em */
.statValue         /* 22px/800, letter-spacing -.02em, tabular-nums */
.statSub           /* 12px, var(--text-4) */
.statDetail        /* 11.5px/600, color: accent — hanya bila `detail` truthy */
```

Empat kartu:

| # | `.statLabel` | `.statValue` | `.statSub` | `accent` | `.statDetail` |
|---|---|---|---|---|---|
| 1 | `Budget Hari Ini` | `fmtFull(dailyBudget)` | `Terpakai {fmt(todaySpent)}` | `dailyRemaining >= 0 ? var(--success) : var(--danger)` | `Sisa {fmtFull(abs(dailyRemaining))}` + ` (lebih)` bila negatif |
| 2 | `Pemasukan Bulan Ini` | `fmtFull(monthIncome)` | `monthLabel` | `var(--accent)` | `{N} transaksi masuk` |
| 3 | `Pengeluaran Bulan Ini` | `fmtFull(monthExpense)` | `{expPct}% dari pemasukan` | `var(--danger)` | `{N} transaksi keluar` |
| 4 | `Total Saldo` | `fmtFull(totalBalance)` | `{wallets.length} dompet aktif` | `var(--accent-ink)` | `{N} saldo negatif` |

Rumus: `dailyBudget = monthIncome / daysInMonth`;
`expPct = monthIncome > 0 ? Math.round(monthExpense / monthIncome * 100) : 0`.

> ⚠️ `StatCard` menerima prop `icon` di JSDoc tapi tidak merendernya. Lihat Part 8.15.

### 6.1.7 Layout Grid Utama

```css
.wrapper  { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.mainGrid { display: grid;
            grid-template-columns: minmax(0,1fr) clamp(320px, 30%, 400px);
            gap: 20px; }
.leftCol, .rightCol { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
```

**Kolom kiri:** `Ringkasan Budget` card, `Transaksi Terbaru` card.
**Kolom kanan:** tombol `Tambah Transaksi`, `Calendar`, `🔔 Restock Segera`,
`💰 Utang/Piutang`, `💳 Tagihan Segera`, `📈 Investasi`, `Dompet`.

**Kartu dasar (pola yang diulang di semua halaman dashboard):**
```css
.card {
  background: var(--bg-card); border-radius: 16px; padding: 20px;
  border: 1px solid var(--border-2); box-shadow: none;
  transition: background .2s, border-color .2s;
  min-width: 0; overflow: hidden;
  animation: fadeInUp .3s ease-out;
}
.cardHeader { display: flex; align-items: center; justify-content: space-between;
              margin-bottom: 16px; gap: 8px; flex-wrap: wrap; }
.cardTitle  { font-size: 14px; font-weight: 700; color: var(--text-1); }
.btnGhost   { display: inline-flex; gap: 6px; padding: 6px 12px; border-radius: 8px;
              border: 1.5px solid var(--border); background: var(--bg-2);
              color: var(--text-3); font-size: 12px; font-weight: 600; }
.linkBtn    { font-size: 12px; font-weight: 600; color: #4F6EF7;
              background: none; border: none; }
```

### 6.1.8 Card: `Ringkasan Budget`

Header: `<h3>` **`Ringkasan Budget`** + ghost `Lihat Detail` → `setPage('budget')`

Body `.budgetList` = `grid repeat(3, minmax(0,1fr))`, gap `var(--space-4)`
(→ 1 kolom di ≤1100px). Selalu **3 baris**, untuk `['needs','wants','savings']`:

```
[● 10×10 warna section]  Kebutuhan          [spent] / [total]
[ProgressBar value=spent max=total color=sectionColor height=7 showOverflow]
{pct}% terpakai · Sisa {fmt(max(0, total - spent))}
```

| Elemen | Styling |
|---|---|
| `.budgetSectionDot` | 10×10, radius 3, `background: sectionColor(sec)` |
| `.budgetSectionName` | 13.5px/600 `var(--text-1)` |
| `.budgetOverflow` | `MELEBIHI!` — 11px/700 `#EF4444` (bila `spent > total`) |
| `.budgetSpent` | 13px, `color: over ? var(--danger) : var(--text-1)` |
| `.budgetSep` | `" / "` — `var(--text-6)` |
| `.budgetFooter` | 11px `var(--text-5)` |

**Warna section** (`utils/helpers.js`): `needs → #4F6EF7`, `wants → #F59E0B`,
`savings → #22C55E`, fallback `#A855F7`.

### 6.1.9 Card: `Transaksi Terbaru`

Header: `<h3>` **`Transaksi Terbaru`** + link `Lihat Semua` → `setPage('tx')`

Data: `getRecentTransactions(transactions, 10)` → **10 baris**, transfer **dikecualikan**,
urutan tanggal menurun.

```
.recentRow   /* flex, align-items center, gap 10, marginBottom 12 */
  .recentIcon   /* 34×34, radius 9, fontSize 16;
                    background: (cat?.color || 'var(--text-6)') + '18',
                    color: cat?.color || 'var(--text-5)' → isi getCatIcon(cat) */
  .recentInfo   /* flex 1, min-width 0 */
    .recentNote  /* t.note — 13px/500 var(--text-1), nowrap + ellipsis */
    .recentMeta  /* 11px var(--text-5) → "{fmtDate(t.date)} · {cat?.name || '—'}" */
  <AmountText type={t.type} amount={t.amount} size={13} />
```

**Mobile `≤768px`:** `.recentRow:nth-child(n + 8) { display: none }` → hanya
7 transaksi yang tampil (baris ke-8 ke-10 disembunyikan).

### 6.1.10 Tombol `Tambah Transaksi`

```css
.addTxBtn {
  display: inline-flex; justify-content: center; gap: 6px;
  width: 100%; padding: 12px; border-radius: 8px; border: none;
  background: #4F6EF7; color: white; font-size: 14px; font-weight: 600;
}
```

Konten: `<NavIcon name="plus" size={18} />` + **`Tambah Transaksi`**.
`onClick = onAddTx` → membuka `TxFormModal` global.
**`display: none` di ≤768px** (digantikan FAB Sidebar).

### 6.1.11 `Calendar` — Kalender Bulanan

**Header:** judul `toLocaleDateString('id-ID',{month:'long',year:'numeric'})` +
2 tombol navigasi `‹` / `›` (28×28, radius 6, `background: var(--bg-2)`,
`border: 1px solid var(--border)`, 16px, `var(--text-3)`).

> Tidak ada kontrol lompat tahun/bulan, tidak ada tombol "hari ini".

**Header hari:** `Min, Sen, Sel, Rab, Kam, Jum, Sab` — 11px/600, center, `var(--text-5)`.

**Grid hari:** `repeat(7, 1fr)`, gap 2px, sel `<button>` dengan modifier:

| Modifier | Condition | Styling |
|---|---|---|
| `.calCellToday` | hari ini | `background: var(--bg-3); border-color: var(--border)`; angka `fontSize 12; fontWeight 700` |
| `.calCellSel` | `day === selectedDay && isCurrentMonth` | `background: #4F6EF7; border-color: #4F6EF7; color: white` |
| `.calDots` | — | flex column, gap 1, `marginTop 2` — maks **2 dot** |
| `.calDot` | expense | `background: var(--danger)` |
| `.calDot` | income | `background: var(--success)` |

Ukuran sel: radius 7, padding `5px 2px`, `min-height: 38px`, flex column center.

**Panel detail hari terpilih** (`.calDetail`) — hanya tampil bila
`selectedTxs.length > 0`:

```
.calDetailDate  /* 12px/600 var(--text-4) →
                   toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'})
                   → "Senin, 29 September" */
.calTxRow      /* flex, space-between, padding 6px 0 */
  .calTxLeft   /* flex, gap 8 */
    .calTxDot  /* 8×8, background cat?.color || var(--border) */
    .calTxNote /* t.note, 13px, var(--text-2) */
  <AmountText size={13} />
```

**Container query (bukan media query):**
```css
.calShell { container-type: inline-size; container-name: cal; }

@container cal (min-width: 520px) {
  .calBody:has(.calDetail) {
    grid-template-columns: minmax(0,300px) minmax(0,1fr);
  }
}
@container cal (max-width: 519px) {
  .calDetail { margin-top: 4px; padding-top: var(--space-3);
               border-top: 1px solid var(--border-2); }
}
```

> ⚠️ `:has()` dipakai di sini — browser lawas tidak mendukung.

### 6.1.12 Widget: `🔔 Restock Segera (N)`

Syarat: `recurringItems.length > 0` **dan** `groupByStatus(items).needsRestock.length > 0`
(threshold 7 hari, urut paling mendesak).

Header: `` `🔔 Restock Segera (${n})` `` + link `Lihat Semua` → `setPage('recurring')`
Body: `needsRestock.slice(0, 4)`, tiap baris pakai `.recentRow`:

```
.recentIcon   /* item.name.charAt(0);
                 bg (cat?.color || '#94A3B8') + '18' */
.recentNote   /* item.name */
.recentMeta   /* formatDaysRemaining(item._daysLeft) */
Pill          /* _daysLeft <= 0 → "Terlambat" (bg rgba(220,38,38,.1) / #F87171)
                 else → "Segera" (bg rgba(217,119,6,.1) / #FBBF24) */
```

### 6.1.13 Widget: `DebtWidget`

Data: `getUpcomingDebts(debts, TODAY, 7)` + `getOverdueDebts(debts, TODAY)`,
disalin → `[...overdue, ...upcoming].slice(0, 5)`.

**Self-hiding:** `if (upcoming.length === 0 && overdue.length === 0) return null`

Header: `` `💰 Utang/Piutang (${n})` `` + link `Lihat Semua` → `setPage('debt')`

```
.recentIcon   /* glyph: utang → '↓' (bg rgba(220,38,38,.08) / #DC2626)
                       piutang → '↑' (bg rgba(37,99,235,.08) / #2563EB) */
.recentNote   /* debt.personName */
.recentMeta   /* "{Utang|Piutang} · {fmtFull(debt.remainingAmount)}" */
Pill          /* overdue → "Terlambat {N} hari" (bg rgba(220,38,38,.1) / #F87171)
                 else → "{N} hari lagi" (bg rgba(217,119,6,.1) / #FBBF24) */
```

Seluruh baris adalah `<div onClick={() => setPage('debt')}>` dengan
`cursor: pointer` — **tanpa `role` / `tabIndex`**, jadi tidak bisa diakses keyboard.

### 6.1.14 Widget: `💳 Tagihan Segera (N)`

Syarat: `subscriptions.length > 0` **dan** `getUpcomingSubscriptions(subs).length > 0`
(aktif, ≤7 hari, termasuk yang overdue, urut mendesak).

Header: `` `💳 Tagihan Segera (${n})` `` + link `Lihat Semua` → `setPage('subscription')`
Body: `upcomingSubs.slice(0, 4)`

```
.recentIcon   /* bg rgba(168,85,247,0.12), color #A855F7, fontSize 16;
                 isi getSubscriptionCategoryInfo(sub.category).emoji */
.recentNote   /* sub.name */
.recentMeta   /* fmtFull(sub.amount) */
Pill          /* days <= 0 → "Terlambat" (#F87171)
                 days === 0 → "Hari ini" (#FBBF24)
                 else → "{days} hari" (#FBBF24) */
```

### 6.1.15 Widget: `InvestmentWidget`

**Self-hiding:** `if (!investments || investments.length === 0) return null`

Seluruh `.card` bisa diklik (`cursor: pointer`) → `setPage('invest')`.
Header: `<h3>` **`📈 Investasi`** + link `Lihat Detail`
(`e.stopPropagation()` lalu navigasi).

Body **sepenuhnya inline style**:
```
Kiri  : eyebrow "Total Portofolio" (11px/600 var(--text-5) uppercase)
        + fmtFull(summary.totalValue) (18px/700 var(--text-1))
Kanan : fmtFull(totalUnrealizedGain) (14px/700, #22C55E bila ≥0 else #EF4444,
        prefix '+' bila ≥0)
        + "{pct}%" (12px/600, warna sama) via totalReturnPercentage.toFixed(1)
```

### 6.1.16 Card: `Dompet`

Header: `<h3>` **`Dompet`** + link `Lihat Semua` → `setPage('wallet')`
Body: `wallets.slice(0, 4)`

```
.walletRow      /* flex, gap 10, marginBottom 12 */
  .walletIcon   /* 34×34, radius 9, bg w.color + '18', color w.color
                    → <WalletIcon type={w.type} size={16} /> */
  .walletInfo   /* flex 1 */
    .walletName   /* w.name, 13px/600 */
    .walletType   /* walletTypeLabel(w.type), 11px, var(--text-5) */
  .walletBalance /* fmt(w.balance), 13.5px/700, tabular-nums,
                    color: w.balance < 0 ? '#EF4444' : var(--text-1) */
```

### 6.1.17 State

| Jenis | Ada? | Detail |
|---|---|---|
| Loading | ❌ | Hanya gate `Memuat data...` di shell |
| Error | ❌ | Hanya gate `dataError` + `Coba Lagi` di shell |
| Empty (transaksi) | ❌ | Card body kosong |
| Empty (dompet) | ❌ | Hanya header |
| Empty (budget) | ❌ | Selalu 3 baris `0rb / 0rb`, `0% terpakai · Sisa 0` |
| Empty (hari kalender) | ❌ | Blok detail hilang sepenuhnya |
| Widget self-hiding | ✅ | `DebtWidget`, `InvestmentWidget`, Restock, Tagihan |
| Over budget | ✅ | Badge `MELEBIHI!` + angka merah + bar merah |

### 6.1.18 Responsive

| Media | Perubahan |
|---|---|
| `@container cal (min-width:520px)` | Grid bulan ‖ detail hari side-by-side |
| `@container cal (max-width:519px)` | Detail hari stack di bawah grid |
| `≤1100px` | `.budgetList` 3 kolom → 1 kolom |
| `≤768px` | `.statGrid` **`display:none`**; `.mainGrid` → 1 kolom; `.card` padding 14px; gap kolom 14px; quick menu jadi grid 4; `.addTxBtn` `display:none`; `.walletRow/.recentRow` `overflow:hidden`; `.walletBalance` 12px + `word-break:break-all`; `.recentIcon` 32px |
| `≤768px` (blok 2) | `.recentRow:nth-child(n + 8) { display: none }` |
| `≥769px` | `.heroCard` & `.greeting` `display:none`; quick menu jadi rail |

---

## 6.2 Dompet

`src/pages/Wallet/WalletPage.jsx` (227) + `WalletPage.module.css` (286)
+ `WalletCard.jsx` (86), `WalletFormModal.jsx` (99), `TransferModal.jsx` (92).

### 6.2.1 Header

```css
.pageHeader  { display: flex; align-items: center; justify-content: space-between;
               margin-bottom: 24px; }
.pageTitle   { font-size: 22px; font-weight: 800; color: var(--text-1); }
.pageSubtitle{ font-size: 13px; color: var(--text-5); margin: 4px 0 0; }
.headerActions { display: flex; gap: 8px; }
```

| Elemen | String |
|---|---|
| `<h1>` | `Dompet` |
| Subtitle | `Kelola semua dompet & rekening Anda` |
| Tombol 1 | `Transfer` — `<NavIcon name="transfer" size={16}/>` (ArrowUpDown) · `.btnGhost` |
| Tombol 2 | `Tambah Dompet` — `<NavIcon name="plus" size={16}/>` · `.btnPrimary` |

```css
.btnGhost   { display: inline-flex; gap: 6px; padding: 8px 14px; border-radius: 8px;
              border: 1.5px solid var(--border); background: var(--bg-2);
              color: var(--text-3); font-size: 13px; font-weight: 600; }
.btnPrimary { display: inline-flex; gap: 6px; padding: 8px 14px; border-radius: 8px;
              border: none; background: #4F6EF7; color: white;
              font-size: 13px; font-weight: 600; }
```

### 6.2.2 Urutan

1. `.pageHeader`
2. `.summaryGrid` — 3 kartu
3. `.groupSection` × s/d 5 (hanya tipe yang punya ≥1 dompet)
4. Modals (conditional)

### 6.2.3 Summary Grid

```css
.summaryGrid { display: grid; grid-template-columns: repeat(3, 1fr);
               gap: 14px; margin-bottom: 24px; }
.summaryCard { background: var(--bg-card); border-radius: 14px; padding: 18px 20px;
               box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04);
               border: 1px solid var(--border-2); text-align: center; }
.summaryLabel{ font-size: 11px; font-weight: 600; color: var(--text-5);
               text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
.summaryValue{ font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
```

| # | Label | Nilai | Warna |
|---|---|---|---|
| 1 | `Total Saldo Bersih` | `fmtFull(netBalance)` | `< 0 ? #EF4444 : #4F6EF7` |
| 2 | `Total Aset` | `fmtFull(totalAsset)` | `#22C55E` |
| 3 | `Total Hutang` | `fmtFull(totalDebt)` | `#EF4444` |

Rumus (`computeWalletAggregates`): `netBalance = Σ balance`;
`totalAsset = Σ balance where balance >= 0`; `totalDebt = Σ balance where balance < 0`
(→ `totalDebt` bernilai negatif, tampil `Rp-…`).

> **Kartu ini satu-satunya yang memakai `box-shadow` ganda.** Kartu di halaman lain
> memakai `box-shadow: none` + border.

### 6.2.4 Group Dompet

```css
.groupSection { margin-bottom: 24px; }
.groupLabel   { font-size: 12px; font-weight: 700; color: var(--text-5);
                text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
.groupGrid    { display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
```

Label group dari `WALLET_TYPES` (`utils/constants.js`):

| `type` | Label |
|---|---|
| `bank` | `Bank` |
| `ewallet` | `E-Wallet` |
| `credit` | `Kartu Kredit` |
| `paylater` | `PayLater` |
| `cash` | `Tunai/Cash` |

Group dengan 0 dompet **tidak dirender sama sekali**.

### 6.2.5 `WalletCard`

Data per kartu: transaksi bulan berjalan (`date.startsWith(monthKey(new Date()))`)
yang `walletId === w.id || toWalletId === w.id`; `income` = Σ `type==='income'`;
`expense` = Σ `type==='expense'`. Label bulan = `toLocaleDateString('id-ID',{month:'short'})` → `Sep`.

```css
.walletCard {
  background: var(--bg-card); border-radius: 14px; padding: 0; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04);
  border: 1px solid var(--border-2);
}
.walletCardHeader {
  padding: 18px 20px; color: white;
  background: linear-gradient(135deg, {w.color}ee, {w.color}99);
}
.walletCardIconWrap { background: rgba(255,255,255,.2); border-radius: 8px; padding: 7px; }
.walletCardName  { font-size: 15px; font-weight: 700; }
.walletCardType  { font-size: 11px; opacity: .75; }   /* + " · ···{note}" */
.walletActionBtn { background: rgba(255,255,255,.2); border: none; color: white;
                   border-radius: 7px; width: 28px; height: 28px; }
.walletCardBalance { font-size: 26px; font-weight: 800; letter-spacing: -.02em;
                     font-variant-numeric: tabular-nums; }
.walletCardFooter  { display: grid; grid-template-columns: 1fr 1fr;
                     padding: 12px 20px; gap: 8px; }
.walletCardFooterIncome  { font-size: 13.5px; font-weight: 700; color: #16A34A; }
.walletCardFooterExpense { font-size: 13.5px; font-weight: 700; color: #DC2626; }
```

Isi:

```
[icon]  {w.name}                              [edit 28×28] [trash 28×28]
        {walletTypeLabel(w.type)} · ···{w.note}
        {fmtFull(w.balance)}

────────────────────────────────────────────────
Pemasukan {Sep}      │ Pengeluaran {Sep}
+{fmt(income)}        │ -{fmt(expense)}
```

**Tombol aksi** (di header gradient):
- `aria-label="Edit wallet"` → `<NavIcon name="edit" size={14}/>`
- `aria-label="Delete wallet"` → `<NavIcon name="trash" size={14}/>`

**Hapus:** `window.confirm('Hapus dompet ini?')` — dialog native browser, **bukan Modal**.
Cancel → return awal; error di-swalllow (`catch { /* error shown via toast */ }`).

> **Transfer tidak masuk** ke `income` maupun `expense`. Dompet yang hanya menerima
> transfer akan menampilkan `+0` / `-0`.

### 6.2.6 State

| Jenis | Ada? |
|---|---|
| Loading | ❌ |
| Error | ❌ |
| Empty (0 dompet) | ❌ — semua group `null`, hanya header + 3 angka nol. **Tidak ada teks "Belum ada dompet"** |
| Validasi nama | ❌ — `if (!form.name.trim()) return;` senyap, tanpa pesan |
| Konfirmasi | ✅ `window.confirm('Hapus dompet ini?')` |

### 6.2.7 `WalletFormModal`

`<Modal title={initial ? 'Edit Dompet' : 'Tambah Dompet'} onClose={onClose}>`
(width default **480**).

State awal: `{ name: initial.name \|\| '', type: initial.type \|\| 'bank',
balance: initial.balance != null ? String(initial.balance) : '',
color: initial.color \|\| '#4F6EF7', note: initial.note \|\| '' }`

| # | Label | Kontrol | Placeholder / opsi |
|---|---|---|---|
| 1 | `Nama Dompet` | `Input` | placeholder `cth. BCA Utama` |
| 2 | `Jenis` | `Select` | `Bank`, `E-Wallet`, `Kartu Kredit`, `PayLater`, `Tunai/Cash` |
| 3 | `Saldo Awal` | `Input type="number"` | placeholder `0` |
| 4 | `Warna` | 8 `.colorSwatch` (28×28 circle, `border: 3px solid transparent`; terpilih → `border-color: var(--text-1)`) | `aria-label="Select color {hex}"` |
| 5 | `Catatan (opsional)` | `Input` | placeholder `cth. 4 digit terakhir` |

**Palet 8 warna dompet:**
`#2563EB` · `#00AED6` · `#4C2A86` · `#F97316` · `#16A34A` · `#DC2626` · `#EC4899` · `#64748B`

**Submit:** `.saveBtn` — teks **`Simpan`**, full-width, `background:#4F6EF7`,
`padding:12px`, radius 8, 14px/600.

**Tidak ada tombol batal di body** — tutup lewat `✕`, Escape, atau backdrop.
**Tidak ada validasi** — nama kosong diam-diam tidak melakukan apa-apa.

Payload: `{ name, type, balance: parseFloat(balance) || 0, color, note: note || '' }`

### 6.2.8 `TransferModal`

`<Modal title="Transfer Antar Dompet" onClose={onClose} width={440}>`

State awal: `{ from: wallets[0]?.id || '', to: wallets[1]?.id || '',
amount: '', date: todayStr, note: '' }`

| # | Label | Kontrol | Detail |
|---|---|---|---|
| 1 | `Dari Dompet` | `Select` | opsi `{w.name} ({fmtFull(w.balance)})` |
| 2 | `Ke Dompet` | `Select` | **sama, tapi di-filter** `w.id !== form.from` |
| 3 | `Jumlah` | `Input type="number"` | placeholder `0` |
| — | Helper | `.availableBalance` 12px `var(--text-5)` | `Saldo tersedia: {fmtFull(fromWallet.balance)}` |
| 4 | `Tanggal` | `Input type="date"` | default hari ini |
| 5 | `Catatan` | `Input` | placeholder `Opsional` |

**Submit:** `.saveBtn` — teks **`Transfer Sekarang`**

**Validasi senyap:** `if (amt <= 0) return;` dan `if (form.from === form.to) return;`
— tanpa pesan. Guard kedua praktis tak terjangkau karena select tujuan sudah
menyaring dompet sumber.

Payload: `{ date, walletId: data.from, type: 'transfer', categoryId: null,
amount, note: data.note || 'Transfer', tags: [], toWalletId: data.to }`

**Tidak ada tombol batal di body.**

### 6.2.9 Responsive

Satu media query `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.summaryGrid` | → 1 kolom (3 kartu stack) |
| `.groupGrid` | → 1 kolom |
| `.pageHeader` | `flex-direction: column; align-items: flex-start; gap: 12px` |
| `.pageTitle` | 22px → 18px |
| `.summaryCard` | `padding: 18px 20px` → `14px` |
| `.summaryValue` | 24px → 18px |

**Tidak berubah:** `.walletCardHeader` (gradient), `.walletCardFooter` (grid 2 kolom),
`.groupGrid` auto-fill. Kartu dompet menjaga anatomi desktop di mobile.

---

## 6.3 Transaksi

`src/pages/Transactions/TransactionsPage.jsx` (394) + `TransactionsPage.module.css` (542)
+ `TxFormModal.jsx` (118).

### 6.3.1 Header

```css
.pageTitle { font-size: 24px; font-weight: 700; flex: 1; text-align: center; }
```

> `.pageTitle` memakai `flex: 1; text-align: center` — judul terpusat di antara slot
> kiri kosong dan tombol kanan. Inkonsisten dengan Dompet (22px/800, tanpa centering).
> Lihat Part 8.4.

| Elemen | String |
|---|---|
| `<h1>` | `Transaksi` |
| Subtitle | `` `{filtered.length} transaksi ditemukan` `` — live, ikut terfilter |
| Tombol | `Tambah` — `<NavIcon name="plus" size={16}/>` · `.btnPrimary` |

**Tidak ada teks eyebrow** di halaman ini maupun halaman lain.

### 6.3.2 Urutan

1. `.pageHeader`
2. `.filterCard`
   - `.filterTopRow` — search + `Filter` + `Hapus Filter`
   - `.dateFilterRow` — 3 tab + period select / custom range
   - `.filterChipArea` — 4 baris chip (conditional)
3. `.summaryBar` — 3 pill
4. `.card` → `.emptyState` **atau** daftar transaksi
5. `TxFormModal` (conditional)

### 6.3.3 Filter Card

```css
.filterCard {
  background: var(--bg-card); border-radius: 16px;
  padding: 16px 20px; margin-bottom: 20px; box-shadow: none;
  border: 1px solid var(--border-2);
}
.filterTopRow { display: flex; gap: 10px; align-items: center; }
.dateFilterRow{ display: flex; gap: 12px; margin-top: 12px; padding-top: 12px;
                border-top: 1px solid var(--border-2); flex-wrap: wrap; }
```

**Baris atas:**

| Elemen | Detail |
|---|---|
| `.searchWrap` | `position: relative; flex: 1` |
| `.searchIcon` | `position: absolute; left: 10px; top: 50%; transform: translateY(-50%)`, `color: var(--text-5)`, `pointer-events: none` → `<NavIcon name="search" size={16}/>` |
| Search input | `paddingLeft: 34`, placeholder **`Cari transaksi…`** (U+2026 ellipsis) |
| `.filterToggleBtn` | `padding 8px 14px`, radius 8, `border 1.5px solid var(--border)`, `bg var(--bg-2)`, `color var(--text-3)`, 13px/600, `white-space: nowrap` → `<NavIcon name="filter" size={15}/>` + `Filter` |
| `.filterToggleBtnActive` | `border-color: #4F6EF7; color: #4F6EF7; background: rgba(79,110,247,0.06)` |
| `.filterBadge` | 18×18 min, radius 99px, `background: #4F6EF7`, `#fff`, 10px/700, `padding: 0 5px`. Isi = jumlah **kelompok filter non-kosong** (maks 4) |
| `.clearBtn` | `Hapus Filter` — `background: transparent`, `color: #EF4444`, 12px/600; hover `bg rgba(220,38,38,0.1)`. Hanya tampil bila `activeFilterCount > 0` |

**Pencarian hanya mencocokkan `note`:**
`t.note.toLowerCase().includes(search.toLowerCase())` — bukan jumlah, tanggal, atau kategori.

**`clearAllFilters()`** mereset keempat `Set` + `search` → `''`, **dan** mengembalikan
mode tanggal ke `'all'` + `fPeriod` → `''`.

### 6.3.4 Tab Mode Tanggal

```css
.dateModeTabs  { display: flex; background: var(--bg-3); border-radius: 24px;
                 padding: 3px; gap: 3px; flex-shrink: 0; }
.dateModeTab   { padding: 6px 14px; border-radius: 20px; border: none;
                 background: transparent; color: var(--text-4);
                 font-size: 12px; font-weight: 600; white-space: nowrap; }
.dateModeTab:hover { color: var(--text-2); }
.dateModeTabActive  { background: #4F6EF7; color: white;
                      box-shadow: 0 2px 8px rgba(79,110,247,0.25); }
```

| Tab | `dateMode` | Kontrol tambahan |
|---|---|---|
| `Per Bulan` | `'month'` | `Select` periode |
| `Custom Range` | `'custom'` | 2 `Input type="date"` (mulai & selesai) |
| `Semua Waktu` | `'all'` | — |

### 6.3.5 Baris Chip Filter (4 kelompok)

Order DOM: **Tipe → Dompet → Kategori → Tag**. Masing-masing punya label `.filterChipLabel`
di kiri dan `MultiChip` di kanan. Baris `Tag` **hanya** tampil bila `tagOpts.length > 0`.

| Kelompok | Label | `allLabel` |
|---|---|---|
| 1 | `Tipe` | `Semua Tipe` |
| 2 | `Dompet` | `Semua Dompet` |
| 3 | `Kategori` | `Semua Kategori` |
| 4 | `Tag` | `Semua Tag` |

Opsi tiap kelompok: `Semua {label}` + nilai unik dari data (tipe transaksi / nama wallet /
nama kategori / tag unik dari seluruh transaksi).

```css
.filterChipArea { margin-top: 12px; display: grid; gap: 10px; }
.filterChipRow  { display: flex; align-items: flex-start; gap: 10px; }
.filterChipLabel{ font-size: 12px; font-weight: 600; color: var(--text-4);
                  min-width: 64px; padding-top: 5px; }
```

### 6.3.6 Summary Bar

Tiga pill, masing-masing berlabel + bernilai:

```css
.summaryBar { display: grid; grid-template-columns: repeat(3, 1fr);
              gap: 10px; margin-bottom: 16px; }
.summaryPill { display: flex; align-items: center; justify-content: space-between;
               padding: 10px 14px; border-radius: 10px;
               border: 1px solid var(--border-2); }
.summaryPillLabel { font-size: 12px; font-weight: 600; }
.summaryPillValue { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
```

| # | Label | Nilai | Warna label | Warna nilai |
|---|---|---|---|---|
| 1 | `↑ Pemasukan` | `fmtFull(totalIn)` | `#16A34A` | `#166534` |
| 2 | `↓ Pengeluaran` | `fmtFull(totalOut)` | `#DC2626` | `#991B1B` |
| 3 | `= Net` | `fmtFull(totalIn - totalOut)` | `#7C3AED` | `#4C1D95` |

Semua nilai dihitung **setelah filter** diterapkan.

### 6.3.7 Daftar Transaksi

Di dalam `.card`, data di-grouping menjadi array `{type:'header', date}` dan
`{type:'row', tx}` — header tanggal naik, transaksi turun.

#### Header Tanggal

```jsx
<div className={`${styles.dateHeader} ${i > 0 ? styles.dateHeaderNotFirst : ''}`}>
```

```
{d.toLocaleDateString('id-ID', {weekday:'short', day:'numeric', month:'short', year:'numeric'})}
                     {dayIn  > 0 && `+{fmt(dayIn)}`}
                     {dayOut > 0 && `-{fmt(dayOut)}`}
```

Contoh: `Sel, 29 Sep 2026` + `+1,5jt` + `-850rb` (hanya ditampilkan bila > 0).
**Tidak ada cabang relatif** — tidak ada `Hari Ini` / `Kemarin`.

#### Baris Transaksi

```jsx
<div className={styles.txRow} onClick={() => setExpandedTxId(expandedTxId === t.id ? null : t.id)}>
```

Klik baris **toggle ekspansi** aksi (bukan navigasi). Struktur:

```
.txIcon      /* t.type === 'transfer' ? '⇄' : getCatIcon(cat)
                bg: (cat?.color || 'var(--text-6)') + '20'
                color: cat?.color || 'var(--text-4)' */
.txBody      /* flex 1, min-width 0 */
  .txNote    /* t.note */
  .txMeta    /* <TxBadge type={t.type} />
                {cat && <span.txCatName>{cat.name}</span>}
                <span.txSep>·</span>
                <span.txWallet>{wallet?.name}{toW ? ` → ${toW.name}` : ''}</span>
                {(t.tags||[]).map(tag => <span.txTag>#{tag}</span>)} */
.txAmount    /* <AmountText type={t.type} amount={t.amount} /> */
.txActions   /* .txActionsVisible hanya saat baris diekspansi */
  button.iconBtn        → <NavIcon name="edit" size={15}/>  (onEdit, stopPropagation)
  button.iconBtnDanger  → <NavIcon name="trash" size={15}/> (onDelete, stopPropagation)
```

Format tag: `#{tag}` (dengan tanda pagar).

### 6.3.8 State

| Jenis | Ada? | Detail |
|---|---|---|
| `.emptyState` | ✅ | Teks: **`Tidak ada transaksi ditemukan`** (`.emptyText`), ikon **`📭`** (`.emptyIcon`) |
| Loading | ❌ | gate shell |
| Error | ❌ | — |

```css
.emptyState { display: flex; flex-direction: column; align-items: center;
              padding: 48px 20px; text-align: center; color: var(--text-4); }
.emptyIcon  { font-size: 48px; margin-bottom: 12px; }
.emptyText  { font-size: 14px; color: var(--text-3); }
```

> Empty state ini terikat pada **hasil filter**, bukan pada `transactions.length` — jadi
> muncul juga saat user memfilter yang tidak menghasilkan apa pun.

### 6.3.9 Responsive

Satu media query `@media (max-width: 768px)`. Perubahannya **tidak** berupa collapse
ke 1 kolom, melainkan **penguatan proporsi**:

| Selektor | Perubahan |
|---|---|
| `.pageHeader` | `flex-direction: column; align-items: flex-start; gap: 12px` |
| `.pageTitle` | 24px → **18px** |
| `.summaryBar` | `flex-direction: column; gap: 8px` |
| `.summaryPill` | `border-radius: 14px; padding: 12px 16px` |
| `.summaryPillValue` | 14px → **15px / 800** |
| `.dateFilterRow` | `flex-wrap: wrap` |
| `.formGrid` | → 1 kolom (modal) |
| `.filterCard` | `padding: 14px; border-radius: 16px` |
| `.card` | `padding: 14px; border-radius: 16px` |
| `.dateHeader` | `border-radius: 12px; padding: 10px 14px; border-left: 3px solid #4F6EF7` |
| `.txIcon` | **lingkaran**: `40×40`, `border-radius: 50%`, `font-size: 14px` |
| `.txRow` | `padding: 12px 0` |
| `.txNote` | → 14px / 600 |
| `.txAmount` | → 14px / 700 |
| `.txActions` | **`display: none`** (aksi disembunyikan) |
| `.txActionsVisible` | `display: flex` (hanya saat baris diekspansi) |

> **Konsekuensi:** di mobile, aksi edit/hapus **tidak bisa diakses** — `.txActions`
> disembunyikan total, dan tidak ada media rule yang membuatnya otomatis terlihat
> seperti di halaman lain. User harus tap baris dulu. Lihat Part 8.16.

### 6.3.10 `TxFormModal`

`<Modal title={initial ? 'Edit Transaksi' : 'Tambah Transaksi'} onClose={onClose} width={500}>`

State awal:
```js
{
  date: initial?.date || TODAY,
  walletId: initial?.walletId || wallets[0]?.id || '',
  type: initial?.type || 'expense',
  categoryId: initial?.categoryId || 'c1',        // ⚠️ hardcode, Part 8.8
  amount: initial?.amount ? String(initial.amount) : '',
  note: initial?.note || '',
  tags: initial?.tags ? initial.tags.join(', ') : '',
  toWalletId: initial?.toWalletId || '',
}
```

Field, **dalam urutan DOM**:

| # | Label | Kontrol | Detail |
|---|---|---|---|
| 1 | `Tipe` | `Select` | `Pengeluaran` · `Pemasukan` · `Transfer` (nilai: `expense`/`income`/`transfer`) |
| 2 | `Tanggal` | `Input type="date"` | default `TODAY` |
| 3 | `Dompet` | `Select` | semua wallet |
| 4a | `Ke Dompet` | `Select` | **hanya saat `type === 'transfer'`**. Opsi pertama `— Pilih —` (value `''`), lalu wallet di-filter `w.id !== form.walletId` |
| 4b | `Kategori` | `CategoryPicker` | **hanya saat `type !== 'transfer'`**. Sumber: `filterCategoriesByTxType(categories, form.type)` |
| 5 | `Jumlah (Rp)` | `Input type="number"` | placeholder `0` |
| — | Shortcut amount | 6 chip | `10000` `25000` `50000` `100000` `200000` `500000` — label `10rb` `25rb` `50rb` `100rb` `200rb` `500rb`. Formula label: `amt >= 1000000 ? (amt/1000000)+'jt' : (amt/1000)+'rb'` |
| 6 | `Catatan` | `Input` | placeholder `Keterangan transaksi` |
| 7 | `Tags (pisahkan dengan koma)` | `Input` | placeholder `cth. rutin, makan` |

Layout: field 1–2 dalam `.formGrid` (2 kolom), field 3–4 dalam `.formGrid` (2 kolom),
field 5–7 full-width.

**Submit:** `.saveBtn`

| Mode | Label |
|---|---|
| Tambah | `Tambah Transaksi` |
| Edit | `Simpan Perubahan` |

**Tidak ada tombol batal di body** — tutup lewat `✕` / Escape / backdrop.

**Validasi:** hanya guard senyap di `handleSubmit`:
```js
if (!form.amount || !form.walletId) return;
```
**Tidak ada pesan error yang pernah tampil.** Tidak ada validasi tanggal, kategori,
dompet tujuan (saat transfer), atau format tag.

Payload: `{ ...form, amount: parseFloat(form.amount),
tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [] }`

**Shortcut chip styling:** `padding: '4px 10px'`, `borderRadius: 6`,
`border: 1px solid var(--border)`, `background: var(--bg-2)`, `color: var(--text-3)`,
`fontSize: 11`, `minHeight: 'auto'` (men-override global `min-height: 44px`).

---

## 6.4 Budget

`src/pages/Budget/BudgetPage.jsx` (584) + `BudgetPage.module.css` (937)
+ `IncomeModal.jsx` (35), `PeriodModal.jsx` (218), `PeriodTransitionModal.jsx` (142),
`SectionEditModal.jsx` (336).

### 6.4.1 Konsep Domain

- **Section** `needs` / `wants` / `savings` → `Kebutuhan` / `Keinginan` / `Tabungan`
- **Panduan 50/30/20** — panduan alokasi yang ditampilkan sebagai pembanding
- **Mode periode** 3: `month` (Per Bulan) · `cycle` (Custom Siklus) · `range` (Custom Rentang)
- **Penyesuaian gaji** — saat tanggal siklus jatuh di hari libur/weekend, siklus
  dimulai dari hari kerja sebelumnya
- **Amortisasi** — biaya bulanan dari barang berkala yang belum dibayar bulan ini

### 6.4.2 Header

| Elemen | String / Detail |
|---|---|
| `<h1>` | `Budget` |
| Subtitle | `Kelola alokasi anggaran Anda` |

Tiga kontrol di `.headerActions` (flex, gap 8), kiri ke kanan:

| # | Kontrol | Label | Ikon | Aksi |
|---|---|---|---|---|
| 1 | `.btnGhost` | dynamic: `Per Bulan` \| `Siklus tgl {cycleStart}` \| `Custom Rentang` | SVG jam raw inline 14×14 (`<circle r=9/>` + `<path d="M12 7v5l3 3"/>`) — **bukan NavIcon** | buka `PeriodModal` |
| 2 | `Select` (`width: auto`) | mode-dependent | chevron native | ganti periode |
| 3 | `.btnGhost` | `Atur Pemasukan` | `<NavIcon name="edit" size={15}/>` (Pencil) | buka `IncomeModal` |

**Opsi `Select` — mode `range`:** daftar `customRanges` urut `start` descending, label
`{formatDateID(start)} – {formatDateID(end)}`. Bila kosong → satu opsi
**`Belum ada periode`** (value `''`).

**Opsi `Select` — mode lain:** gabungan key `budgets` yang cocok `/^\d{4}-\d{2}$/` +
`transactions[].date.slice(0,7)` + bulan berjalan, `.reverse()` (terbaru dulu), label
`toLocaleDateString('id-ID',{month:'long',year:'numeric'})` → `April 2026`.

> Helper lokal `formatDateID` memakai bulan **panjang**:
> `toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})` → `23 Mei 2026`
> — berbeda dari `fmtDate` yang memakai bulan pendek.

### 6.4.3 Urutan Section

1. `.pageHeader`
2. `.periodEndedBanner` — **conditional**: `periodMode === 'range' && selectedRange && TODAY > selectedRange.end`
3. `.periodBar` — selalu
4. `.statsGrid` — 4 kartu
5. `.distCard` — distribusi + panduan 50/30/20
6. 3× `.sectionCard` — `needs` → `wants` → `savings` (urutan tetap)
7. `.sectionCard` amortisasi — **conditional** `recurringItems.length > 0`
8. Modals

### 6.4.4 Banner Periode Berakhir

```css
.periodEndedBanner {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; padding: 14px 18px;
  background: rgba(245,158,11,0.08);
  border: 1.5px solid rgba(245,158,11,0.3);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  margin-bottom: 16px;
}
.periodEndedIcon  /* '⚠️' 20px */
.periodEndedTitle /* 'Periode telah berakhir' */
.periodEndedDesc  /* 'Periode {start} – {end} telah berakhir.
                     Buat periode baru untuk melanjutkan pencatatan.' */
.periodEndedBtn   /* 'Buat Periode Baru' — background #F59E0B, color white,
                     hover #D97706, white-space nowrap, flex-shrink 0
                     → buka PeriodTransitionModal */
```

### 6.4.5 Bar Periode Aktif

```css
.periodBar {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card); border-radius: 10px;
  padding: 10px 16px; margin-bottom: 20px;
  border: 1px solid var(--border-2);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.periodBarLabel  /* 12px var(--text-5) weight 500 → 'Periode aktif:' */
.periodBarValue  /* 13px/700 var(--text-1) */
.salaryAdjustBadge /* '📅 Disesuaikan' — 10px/600 #4F6EF7 pada rgba(79,110,247,0.08),
                      radius 4, padding 2px 6px */
.periodBarRange  /* '(2026-03-25 s/d 2026-04-24)' — 11px var(--text-4),
                    tabular-nums, hanya bila periodMode !== 'range' */
```

Nilai `.periodBarValue`:

| Mode | Isi | Contoh |
|---|---|---|
| `range` | `{formatDateID(start)} – {formatDateID(end)}` | `23 Maret 2026 – 24 April 2026` |
| `cycle`, `cycleStart > 1` | `Siklus tgl {n}: {periodRange.label}` | `Siklus tgl 25: 25 Mar – 24 Apr` |
| lainnya | `periodRange.label` | `April 2026` |

Badge `📅 Disesuaikan` tampil bila `periodMode === 'cycle' && cycleStart > 1 && salaryAdjust`.

### 6.4.6 Empat Kartu Statistik

```css
.statsGrid { display: grid; grid-template-columns: repeat(4, 1fr);
             gap: 14px; margin-bottom: 24px; }
.statCard  { background: var(--bg-card); border-radius: 14px; padding: 16px 20px;
             box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04);
             border: 1px solid var(--border-2); }
.statLabel { font-size: 11px; font-weight: 600; color: var(--text-5);
             text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
.statValue { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.statSub   { font-size: 11.5px; color: var(--text-4); }
```

| # | `.statLabel` | `.statValue` | Warna nilai | `.statSub` |
|---|---|---|---|---|
| 1 | `Total Pemasukan` | `fmtFull(budget.totalIncome)` | `#4F6EF7` | *(tidak ada)* |
| 2 | `Total Dialokasikan` | `fmtFull(totalAllocated)` | `#F59E0B` | `{pct}% dari pemasukan` |
| 3 | `Belum Dialokasikan` | `fmtFull(unallocated)` | `<0 ? #EF4444 : #22C55E` | `<0 ? '⚠ Alokasi melebihi pemasukan' : 'Masih tersedia'` |
| 4 | `Total Terpakai` | `fmtFull(totalSpent)` | `#EF4444` | `{pct}% dari alokasi` |

Persentase dibulatkan (`Math.round`); bila pembagi 0 → tampil `0%`.

### 6.4.7 Card Distribusi Alokasi

```css
.distCard { background: var(--bg-card); border-radius: 14px; padding: 16px 20px;
            margin-bottom: 24px; border: 1px solid var(--border-2);
            box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04); }
.distHeader { display: flex; justify-content: space-between; margin-bottom: 10px; }
.distTitle  /* 'Distribusi Alokasi' — 13px/700 var(--text-1) */
.distGuide  /* 'Panduan 50/30/20' — 11px var(--text-5) */
.distBar    { display: flex; height: 12px; border-radius: 99px;
              overflow: hidden; gap: 2px; }
.distSegment{ width: {pct}%; background: sectionColor(sec); border-radius: 99px;
              flex-shrink: 0; transition: width .4s; }
.distUnalloc{ flex: 1; background: var(--border); border-radius: 99px;
              min-width: 4px; }   /* conditional: unallocated > 0 */
.distLegend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
```

`pct = sectionTotal / totalIncome * 100`. **Segmen dirender even pada 0% width.**

Legend, tiap item = `.distDot` (8×8, radius 2, warna section) + `.distLegendLabel`
(12px `var(--text-4)`) + `.distLegendPct` (12px/700) + `.distLegendGuide` (11px `var(--text-6)`):

| Section | Panduan | Warna pct |
|---|---|---|
| `Kebutuhan` | `(panduan 50%)` | `#F59E0B` bila `abs(pct - 50) > 10`, selainnya `var(--text-1)` |
| `Ke keinginan` | `(panduan 30%)` | idem, terhadap 30 |
| `Tabungan` | `(panduan 20%)` | idem, terhadap 20 |

Item ke-4 — **conditional** `unallocated > 0`: dot `var(--border)`, label
**`Belum dialokasikan`**, pct `{pct}%` (`var(--text-5)`), dan di slot panduan tampil
`({fmtFull(unallocated)})`.

### 6.4.8 Card Section (× 3)

```css
.sectionCard { background: var(--bg-card); border-radius: 14px; padding: 20px;
               margin-bottom: 16px; border: 1px solid var(--border-2);
               box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04); }
.sectionHeader { display: flex; justify-content: space-between; margin-bottom: 14px; }
.sectionDot    /* 12×12, border-radius 3, background sectionColor(sec) */
.sectionName   /* 16px/700 var(--text-1) */
.sectionOverflowBadge  /* 'Melebihi Batas' + <NavIcon name="warning" size={11}/> —
                          11px/700, bg rgba(220,38,38,0.1), color #F87171,
                          radius 6, padding 2px 8px */
.sectionHeaderRight { display: flex; align-items: center; gap: 12px; }
.sectionSpent    /* 13px/700 tabular-nums: fmtFull(spent) / fmtFull(total)
                    color #EF4444 bila over, else var(--text-1) */
.sectionRemaining/* 11px var(--text-5): 'Sisa {fmtFull(max(0, total - spent))}' */
.sectionEditBtn  /* 'Edit' + <NavIcon name="edit" size={13}/> — 12px/600,
                    padding 6px 12px, radius 8, border 1.5px var(--border),
                    bg var(--bg-2), color var(--text-3) → SectionEditModal */
.catGrid  { margin-top: 16px; display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
```

**ProgressBar:** `value={spent} max={total} color={sectionColor(sec)} height={8} showOverflow`

#### Kartu Kategori (`.catCard`)

```css
.catCard  { background: var(--bg-2); border-radius: 10px; padding: 12px 14px; }
.catDot   /* 8×8, border-radius 2, background cat?.color || var(--text-6) */
.catName  /* 13px/500 var(--text-2); fallback ke c.id bila kategori hilang */
.catOver  /* 'OVER' — 10px/700 #EF4444, bila cSpent > c.amt */
.catFooter{ display: flex; justify-content: space-between; margin-top: 5px; }
.catAmounts/* 11px var(--text-5): '{fmt(cSpent)} / {fmt(c.amt)}' — bentuk SINGKAT */
.catPct   /* 11px/600: '{pct}%', color #EF4444 bila over else var(--text-4) */
```

ProgressBar kategori: `height={5}`, `color={cat?.color || sectionColor(sec)}`, `showOverflow`.

> **Perhatikan:** header section memakai `fmtFull` (penuh), baris kategori memakai `fmt`
> (singkat). Inkonsisten — disengaja agar baris padat tetap muat.

#### Kartu Belum Dialokasikan (`.unallocCard`)

**Conditional** `unallocInSec > 0` (total section − jumlah alokasi kategori):

```css
.unallocCard { background: rgba(245,158,11,0.08); border-radius: 10px;
               padding: 12px 14px;
               border: 1.5px dashed rgba(245,158,11,0.4); }
.unallocLabel /* 'Belum Dialokasikan' — 12px/600 var(--text-2) */
.unallocValue /* fmtFull(unallocInSec) — 16px/800 var(--text-1) */
```

### 6.4.9 Card Biaya Berkala (Amortized)

**Conditional** `recurringItems.length > 0`. Mengakai class `.sectionCard` + `marginTop: 20`.

**Header:** `<span>📦</span>` + `.sectionName` = **`Biaya Berkala (Amortized)`**

> ⚠️ Header memakai class `.sectionLeft` yang **tidak terdefinisi** di CSS module
> (yang ada `.sectionHeaderLeft`) → wrapper-nya tanpa style. Lihat Part 8.15.

**Body — grid 3 kolom (inline style, bukan CSS module):**
```js
display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12
```
Tiap tile: `padding: '10px 12px'`, `background: sectionColor(sec) + '10'`,
`borderRadius: 8`, `textAlign: 'center'`, label 11px/600 `var(--text-4)`, nilai
14px/700 `sectionColor(sec)` = `fmtFull(Math.round(val))`.

**Baris total:** flex `space-between`, `padding: '10px 14px'`, `background: var(--bg-3)`,
radius 8 → label **`Total biaya berkala/bulan`** (12px/600 `var(--text-3)`) + nilai
`fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))` (15px/700 `#4F6EF7`).

**Footnote** (11px `var(--text-4)`, `lineHeight 1.5`):
```
💡 Ini adalah biaya bulanan dari item yang dibeli berkala (skincare, shampo, dll)
   yang diamortisasi berdasarkan durasi pemakaian.
```

### 6.4.10 State

| Jenis | Ada? | Detail |
|---|---|---|
| Loading | ❌ | — |
| Error | ❌ | — |
| True empty | ❌ | `EMPTY_BUDGET` = `{totalIncome: 0, sections: {needs/wants/savings: {total:0, cats:[]}}}`. Semua stat `Rp0`, bar distribusi 0%, 3 card section kosong (`Rp0 / Rp0`, `Sisa Rp0`, `catGrid` kosong) |
| Teks "empty" | ✅ satu-satunya | `Belum ada periode` — opsi `<Select>` mode range saat `customRanges` kosong |
| Over budget | ✅ | `⚠ Alokasi melebihi pemasukan` · `Melebihi Batas` · `OVER` · bar merah |

### 6.4.11 `IncomeModal` — Atur Total Pemasukan

`<Modal title="Atur Total Pemasukan" onClose={onClose} width={400}>`

| Field | Label | Kontrol | Placeholder |
|---|---|---|---|
| 1 | `Total Pemasukan Bulan Ini (Rp)` | `Input type="number"` | `0` |

**Submit:** `.btnPrimary` — **`Simpan`**, full-width, `background:#4F6EF7`, radius 8,
padding 12, 14px/600. **Tanpa tombol batal.**
**Tanpa validasi** — `parseFloat(income) || 0`.

### 6.4.12 `PeriodModal` — Atur Periode Budget

`<Modal title="Atur Periode Budget" onClose={onClose} width={460}>`

**Paragraf pengantar** (13px `var(--text-4)`, lineHeight 1.6, mb 20):
```
Pilih bagaimana periode budget dihitung. Jika gaji Anda masuk di pertengahan
bulan (misal tanggal 23–25), gunakan Custom Siklus agar budget sesuai dengan
siklus pemasukan Anda.
```
(`<strong>` membungkus `Custom Siklus`)

**Field `Mode Periode`** — `.periodModeRow` (`grid repeat(3,1fr)`, gap 10).
Tiga kartu `.periodModeBtn` (`padding: 12px 14px`, radius 10,
`border: 1.5px solid var(--border)`; aktif → `.periodModeBtnActive` =
`border-color:#4F6EF7; background:rgba(79,110,247,0.06)`;
hover → `border-color: var(--text-5)`):

| Nilai | Ikon | `.periodModeName` | `.periodModeDesc` |
|---|---|---|---|
| `month` | 📅 | `Per Bulan` | `Tanggal 1 – akhir bulan` |
| `cycle` | 🔄 | `Custom Siklus` | `Sesuai tanggal gajian` |
| `range` | 📆 | `Custom Rentang` | `Pilih tanggal mulai & akhir` |

**Field `Tanggal Mulai Siklus`** — **conditional** `mode === 'cycle'`.
`.dayGrid` (flex wrap, gap 8) berisi 13 `.dayBtn` (44×44, radius 9,
`border: 1.5px solid var(--border)`, `background: var(--bg-card)`, `color: var(--text-3)`,
13px/400; aktif `.dayBtnActive` = `border-color:#4F6EF7; background:var(--bg-3);
color:#4F6EF7; font-weight:700`).

`DAY_OPTIONS = [1, 5, 10, 15, 20, 21, 22, 23, 24, 25, 26, 27, 28]`
— tanggal 2–4, 29, 30, 31 **tidak tersedia**.

Nilai awal: `currentCycleStart > 1 ? currentCycleStart : 25`.

**Helper** (11px `var(--text-5)`, mt 10):

| Kondisi | Teks |
|---|---|
| `day <= 1` | `Siklus: 1 – akhir bulan (sama dengan Per Bulan)` |
| else | `Siklus: tgl {day} bulan lalu – tgl {day-1} bulan berjalan` |

`.cycleExample` (12px `var(--text-3)`, `background: var(--bg-3)`, radius 6,
`padding: 6px 10px`, mt 8):

| Kondisi | Isi |
|---|---|
| `day <= 1` | `Contoh: 1 Apr – 30 Apr 2026` |
| else | `Contoh: {day} Mar – {day-1} Apr 2026` |

**Blok penyesuaian gaji** — **conditional** `mode === 'cycle'`:

```css
.salaryAdjustSection { margin-bottom: 20px; padding: 12px 14px;
                       background: var(--bg-2); border-radius: 10px;
                       border: 1px solid var(--border-2); }
.salaryAdjustCheckbox { accent-color: #4F6EF7; 16×16 }
.salaryAdjustLabel    /* 'Sesuaikan hari libur' — 13px/600 var(--text-2) */
.salaryAdjustDesc     /* 'Jika tanggal gajian jatuh di hari libur/weekend,
                          periode akan dimulai dari hari kerja sebelumnya'
                          — 11px var(--text-5), lineHeight 1.5 */
```

Preview — **conditional** `salaryAdj && adjustedPreview`
(`background: rgba(79,110,247,0.06)`, `border: 1px solid rgba(79,110,247,0.15)`, radius 6):

| Elemen | Isi |
|---|---|
| `.salaryAdjustPreviewLabel` | `Tanggal disesuaikan:` bila berubah, `Tanggal tidak berubah:` bila tidak |
| `.salaryAdjustPreviewDate` | `toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})` → `Senin, 23 Maret 2026` — 13px/700 `#4F6EF7` |

**Field mode `range`:**

| Label | Kontrol | Error |
|---|---|---|
| `Tanggal Mulai` | `Input type="date"` | — |
| `Tanggal Akhir` | `Input type="date"` | **`Tanggal akhir harus setelah tanggal mulai`** |

> Pesan error ini **menggantikan** pesan dari `validateCustomRange` yang berbahasa
> Inggris (`Start date must be in YYYY-MM-DD format`, dst). Hanya aturan urutan
> tanggal yang diekspos ke user; aturan format tanggal disembunyikan.

**Submit:** `.btnPrimary` — **`Simpan Pengaturan`**

Disabled bila: `mode === 'range' && (!rangeStart || !rangeEnd || validateCustomRange(...) !== null)`.
Style disabled: inline `{opacity: 0.5, cursor: 'not-allowed'}`. **Tanpa tombol batal.**

### 6.4.13 `PeriodTransitionModal` — Periode Baru

`<Modal title="Periode Baru" onClose={onClose} width={460}>`

**Paragraf:** `Periode sebelumnya telah berakhir. Buat periode baru untuk melanjutkan
pencatatan budget Anda.` (13px `var(--text-4)`, lineHeight 1.6, mb 16)

**Blok referensi** (`.transitionPrevPeriod`, `padding: 10px 14px`, `background: var(--bg-2)`,
radius 8, `border: 1px solid var(--border-2)`, mb 16):
`.transitionPrevLabel` = **`Periode sebelumnya`** (11px/600 uppercase `var(--text-5)`)
+ `.transitionPrevDates` = `{formatDateID(prev.start)} – {formatDateID(prev.end)}` (13px/700)

**Field:**

| # | Label | Kontrol | Catatan |
|---|---|---|---|
| 1 | `Tanggal Mulai` | `Input type="date"` | **`readOnly`**, value = `dayAfter(previousPeriod.end)`, `background: var(--bg-2)`, `cursor: not-allowed`, `opacity: 0.7` |
| 2 | `Tanggal Akhir` | `Input type="date"` | `min={newStart}`; error `Tanggal akhir harus setelah tanggal mulai` |
| 3 | `Opsi Budget` | 2 radio (`.transitionOptionRow`, `1fr 1fr`) | lihat tabel |

`.transitionOption` = flex `align-items:flex-start` gap 10, `padding: 12px 14px`,
radius 10, `border: 1.5px solid var(--border)`, `background: var(--bg-card)`;
terpilih → `.transitionOptionActive` = `border-color:#4F6EF7; background:rgba(79,110,247,0.06)`.
Radio `accent-color: #4F6EF7`.

| Radio | `.transitionOptionName` | `.transitionOptionDesc` | Default |
|---|---|---|---|
| `copyBudget` | `📋 Salin dari periode sebelumnya` | `Salin alokasi pendapatan & kategori` | ✅ |
| `!copyBudget` | `✨ Mulai baru` | `Mulai dengan budget kosong` | |

**Submit:** `.btnPrimary` — **`Buat Periode Baru`**, disabled sampai `endDate` terisi
**dan** `validateCustomRange({start: newStart, end: endDate}) === null`. Tanpa tombol batal.

Aksi: tambah `{id: range_<start>_<end>, start, end}` ke `customRanges`; bila `copyBudget`,
`deepCloneBudget` ke key baru; lalu `setRangeOverride(newRangeId)`.

### 6.4.14 `SectionEditModal` — Edit Budget per Section

`<Modal title={`Edit Budget · ${sectionLabel(section)}`} onClose={onClose} width={540}>`
Contoh judul: `Edit Budget · Kebutuhan`

**1. Field total section**

| Label | Kontrol | Placeholder |
|---|---|---|
| `Total Anggaran {sectionLabel} (Rp)` | `Input type="number"` | `0` |

Tanpa slot error.

**2. Bar status alokasi** (`.allocBar` + modifier, flex `space-between`, 12px, mb 16,
`padding: 8px 12px`, radius 8)

```
Dialokasikan ke kategori: {fmtFull(catSum)}
```

| Kondisi | Teks status | Class | Warna |
|---|---|---|---|
| `diff < 0` | `⚠ Melebihi {fmtFull(-diff)}` | `.allocBarOver` | `rgba(220,38,38,0.08)` / `#F87171` |
| `diff > 0` | `Belum dialokasikan: {fmtFull(diff)}` | `.allocBarUnder` | `rgba(245,158,11,0.08)` / `#FBBF24` |
| `diff === 0` | `✓ Sesuai` | `.allocBarMatch` | `rgba(34,197,94,0.08)` / `#4ADE80` |

`.allocBarLabel strong` memakai `font-variant-numeric: tabular-nums`.

**3. Daftar kategori** (`.catList`)

Tiap `.catRow`: `.catRowDot` (8×8, radius 2, warna kategori) + `.catRowName`
(13px `var(--text-2)`, `flex: 1`, fallback `c.id`) + `Input type="number"`
(`width: 130`) + 2 tombol:

| Tombol | `aria-label` | Ikon | Class |
|---|---|---|---|
| Edit | `Edit category` | `<NavIcon name="edit" size={14}/>` | `.iconBtn` |
| Hapus | `Remove category` | `<NavIcon name="trash" size={14}/>` | `.iconBtn.iconBtnDanger` |

**Mode inline edit** (`.inlineEdit`, `background: var(--bg-2)`, radius 10,
`padding: 10px 12px`, `border: 1.5px solid var(--border)`, mb 8):
`Input` placeholder **`Nama kategori`** (`flex: 1`) + `.colorPicker` 12 swatch +
2 tombol: `.btnSmallPrimary` (✓ + `Simpan`) dan `.btnSmallGhost` (`Batal`).

**12 warna kategori** (inline, urut):
```
#F59E0B  #3B82F6  #8B5CF6  #EF4444  #06B6D4  #EC4899
#F97316  #22C55E  #14B8A6  #A855F7  #10B981  #64748B
```

Swatch: 22×22, `border-radius: 50%`, `border: 2.5px solid transparent`;
terpilih → `.colorSwatchSelected` = `border-color: var(--text-1)`.
`aria-label` = `Color {hex}`.

**4. Tambah kategori existing** — **conditional** `unusedCats.length > 0`

`.addCatRow` (flex, gap 8, mb 10) berisi `Select` (`flex: 1`) dengan opsi placeholder
**`+ Tambah kategori`** + tombol `.btnSmallGhost` **`Tambah`**.

Bila semua kategori terpakai → `.allCatsMsg` (12px `var(--text-6)`, mb 10):
```
Semua kategori sudah ditambahkan.
```

**5. Buat kategori baru** (toggle `showCustom`)

*Collapsed:* `.createCatBtn` — `<NavIcon name="plus" size={13}/>` + **`Buat Kategori Baru`**
(dashed `1px dashed var(--border-2)`, radius 6, mt 6, 13px `var(--text-4)`)

*Expanded:* `.customCatForm` (`background: var(--bg-2)`, radius 10, `padding: 12px 14px`,
`border: 1.5px solid var(--border)`, mb 12) berisi `.customCatTitle` = **`Kategori Baru`**,
`Input` placeholder `Nama kategori`, 12 swatch warna, dan 2 tombol:
`.btnSmallPrimary` (＋ + **`Buat`**) dan `.btnSmallGhost` (**`Batal`**).
Warna default `#64748B`.

> Nama kosong → `if (!customForm.name.trim()) return;` **senyap, tanpa pesan**.

**6. Submit:** `.btnPrimary` — **`Simpan`**, tanpa tombol batal.
Menulis `{total, cats: [{id, amt}]}` ke `budgets[budgetKey].sections[section]`.

### 6.4.15 Responsive

Dua blok `@media (max-width: 768px)` (baris 756 dan 927).

*Blok 1:*

| Selektor | Perubahan |
|---|---|
| `.statsGrid` | `repeat(2, 1fr)`, gap 10px |
| `.catGrid` | → 1 kolom |
| `.pageHeader` | `flex-direction: column; align-items: flex-start; gap: 12px` |
| `.pageTitle` | 22px → **18px** |
| `.statValue` | 20px → **16px** |
| `.sectionCard` | `padding: 20px` → `14px` |
| `.distCard` | `padding: 16px 20px` → `14px` |

*Blok 2:*

| Selektor | Perubahan |
|---|---|
| `.periodEndedBanner` | `flex-direction: column; align-items: flex-start` |
| `.periodEndedBtn` | `width: 100%; justify-content: center` |

**Tidak di-collapse:** `.headerActions` (3 kontrol tetap sebaris), `.periodBar`,
`.periodModeRow` (3 kolom di dalam modal), `.transitionOptionRow` (2 kolom di modal).

> Karena halaman ini `pageMeasure` (880px), `@media (max-width: 768px)` baru aktif saat
> viewport < 768px.

---

## 6.5 Barang Berkala

`src/pages/Recurring/RecurringPage.jsx` (301, termasuk komponen `ItemCard` inline di
baris 231) + `RecurringPage.module.css` (420) + `RecurringFormModal.jsx` (171),
`RepurchaseModal.jsx` (92).

### 6.5.1 Konsep Domain

Mencakup item yang **dibeli berkala lalu habis dipakai** (skincare, shampo, pasta gigi) —
berbeda dari Langganan yang berupa biaya tetap berulang. Kunci: durasi pemakaian →
amortisasi bulanan (`harga / durasi × 30`) → pengingat restock.

### 6.5.2 Header

```css
.pageTitle { font-size: 24px; font-weight: 700; flex: 1; text-align: center; }
.addBtn    { display: flex; align-items: center; gap: 6px;
             padding: 10px 18px; border-radius: 10px; border: none;
             background: #4F6EF7; color: #fff; font-size: 13px; font-weight: 600; }
.addBtn:hover { background: #3B5DE7; }
```

| Elemen | String |
|---|---|
| `<h1>` | `Barang Berkala` |
| Subtitle | `Kelola item yang dibeli secara berkala (skincare, shampo, dll)` |
| Tombol | `Tambah Item` — `<NavIcon name="plus" size={16}/>` |

> Judul terpusat di antara slot kiri kosong dan tombol kanan; subtitle rata kiri.

### 6.5.3 Urutan

1. `.pageHeader`
2. `.summaryGrid` — 3 kartu
3. Empty state — **conditional** `recurringItems.length === 0`
4. `🔴 Perlu Restock` — **conditional** `needsRestock.length > 0`
5. `✅ Masih Tersedia` — **conditional** `available.length > 0`
6. `⏸️ Non-aktif` — **conditional** `inactive.length > 0`
7. Modals

### 6.5.4 Tiga Kartu Ringkasan

```css
.summaryGrid { display: grid; grid-template-columns: repeat(3, 1fr);
               gap: 14px; margin-bottom: 24px; }
.summaryCard { background: var(--bg-card); border-radius: 16px; padding: 16px 20px;
               box-shadow: none; border: 1px solid var(--border-2); }
.summaryLabel{ font-size: 11px; font-weight: 600; color: var(--text-5);
               text-transform: uppercase; letter-spacing: .04em; }
.summaryValue{ font-size: 18px; font-weight: 700; }
.summarySub  { font-size: 12px; color: var(--text-4); margin-top: 4px; }
```

| # | Label | Nilai | Warna | Sub |
|---|---|---|---|---|
| 1 | `Biaya Bulanan (Amortized)` | `fmtFull(Math.round(totalAmortized))` | `#4F6EF7` | `per bulan dari {N} item aktif` |
| 2 | `Perlu Restock` | `needsRestock.length` | `> 0 ? #DC2626 : #22C55E` | `item dalam 7 hari ke depan` |
| 3 | `Total Item` | `recurringItems.length` | *(inherit)* | `{N} aktif · {M} non-aktif` |

### 6.5.5 Tiga Grup Status

```css
.section      { margin-bottom: 24px; }
.sectionTitle { display: flex; align-items: center; gap: 8px; font-size: 13px;
                font-weight: 700; color: var(--text-3); text-transform: uppercase;
                letter-spacing: .04em; margin-bottom: 12px; }
.sectionBadge { font-size: 11px; font-weight: 600; background: var(--bg-3);
                color: var(--text-4); padding: 2px 8px; border-radius: 10px; }
```

| Grup | Prefix | Judul | Badge |
|---|---|---|---|
| 1 | `🔴` (`#DC2626`) | `Perlu Restock` | `needsRestock.length` |
| 2 | `✅` (`#22C55E`) | `Masih Tersedia` | `available.length` |
| 3 | `⏸️` | `Non-aktif` | `inactive.length` |

Tiap grup sudah terurut **paling mendesak dulu** (`_daysLeft` menaik).

### 6.5.6 `ItemCard` (komponen inline)

```css
.card       { background: var(--bg-card); border-radius: 16px; padding: 16px 20px;
              box-shadow: none; border: 1px solid var(--border-2);
              margin-bottom: 10px; }
.cardUrgent { border-color: #FCA5A5; }   /* hanya grup Perlu Restock */
.itemRow    { display: flex; align-items: center; gap: 14px; }
.itemIcon   { width: 38px; height: 38px; border-radius: 10px; font-size: 18px;
              /* bg (cat?.color || '#94A3B8') + '18', color sama */ }
.itemInfo   { flex: 1; min-width: 0; }
.itemName   { font-size: 14px; font-weight: 600; color: var(--text-1);
              single-line ellipsis }
.itemMeta   { display: flex; align-items: center; gap: 8px;
              font-size: 12px; color: var(--text-4); }
.itemRight  { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.itemAmount { font-size: 13px; font-weight: 600; color: var(--text-2);
              text-align: right; }
.itemAmortized { font-size: 11px; color: var(--text-4); text-align: right; }
.itemStatus { font-size: 11px; font-weight: 600; padding: 3px 8px;
              border-radius: 6px; white-space: nowrap; }
.repurchaseBtn { background: #22C55E; color: #fff; padding: 6px 12px;
                 border-radius: 8px; font-size: 11px; font-weight: 600; }
.repurchaseBtn:hover { background: #16A34A; }
.actions    { display: flex; gap: 6px; margin-left: 8px; }
.actionBtn  { width: 30px; height: 30px; border-radius: 8px;
              border: 1px solid var(--border); background: var(--bg-2);
              color: var(--text-4); }
.actionBtn:hover { background: var(--bg-3); color: var(--text-2); }
```

**Isi baris:**

```
.itemIcon      → item.name.charAt(0).toUpperCase()
.itemName      → item.name
.itemMeta      → {cat?.name || '—'} · {formatDuration(item.durationDays)}
                 [· {item.note} bila ada]
.itemAmount    → fmtFull(item.amount)
.itemAmortized → {fmt(round(getAmortizedMonthlyCost(amount, durationDays)))}/bln
```

**Pill status** (disembunyikan bila item inactive atau `_daysLeft === undefined`):

| Kondisi | Class | Teks | Warna |
|---|---|---|---|
| `daysLeft <= 0` | `.statusUrgent` | `formatDaysRemaining(…)` | `rgba(220,38,38,0.1)` / `#F87171` |
| `daysLeft <= 7` | `.statusSoon` | idem | `rgba(217,119,6,0.1)` / `#FBBF24` |
| else | `.statusOk` | idem | `rgba(22,163,74,0.1)` / `#4ADE80` |

`formatDaysRemaining(days)`:

| `days` | Teks |
|---|---|
| `0` | `hari ini` |
| `1` | `besok` |
| `> 0` | `{N} hari lagi` |
| `< 0` | `terlambat {N} hari` |

`formatDuration(days)`: `≥30 && %30===0 → '{n} bulan'`; `45 → '1.5 bulan'`;
`14 → '2 minggu'`; `7 → '1 minggu'`; `≥30 → '{x.y} bulan'`; else `'{n} hari'`.

**Klaster aksi:**

| Tombol | Label | Syarat | Aksi |
|---|---|---|---|
| `.repurchaseBtn` | `Sudah Beli` | `!inactive && onRepurchase` | buka `RepurchaseModal` |
| `.actionBtn` | `title="Edit"` | selalu | `<NavIcon name="edit" size={14}/>` → `RecurringFormModal` mode edit |
| `.actionBtn` | `title="Aktifkan"` / `title="Non-aktifkan"` | selalu | `<NavIcon name={inactive ? 'check' : 'close'} size={14}/>` → toggle `isActive` |

### 6.5.7 Empty State

**Hanya** bila `recurringItems.length === 0` — 3 kartu ringkasan di atasnya **tetap
tampil** (semua nol).

```css
.emptyState { text-align: center; padding: 48px 20px; color: var(--text-4); }
.emptyIcon  { font-size: 48px; margin-bottom: 12px; }
.emptyTitle { font-size: 16px; font-weight: 600; color: var(--text-3);
              margin-bottom: 8px; }
.emptyDesc  { font-size: 13px; color: var(--text-4); max-width: 320px;
              margin: 0 auto 20px; line-height: 1.5; }
```

| Elemen | Isi |
|---|---|
| `.emptyIcon` | `📦` |
| `.emptyTitle` | `Belum ada barang berkala` |
| `.emptyDesc` | `Tambahkan item yang kamu beli secara berkala seperti skincare, shampo, pasta gigi, dll. BudgetX akan menghitung biaya bulanan sebenarnya dan mengingatkan kapan harus beli ulang.` |
| Tombol | `<NavIcon name="plus" size={16}/>` + **`Tambah Item Pertama`** (`margin: 0 auto`) |

**Tidak ada** "filtered empty" state (berbeda dengan Langganan). Grup yang kosong
begitu saja tidak dirender.

### 6.5.8 State

| Jenis | Ada? |
|---|---|
| Loading | ❌ |
| Error | ❌ |
| Empty | ✅ hanya saat 0 item (lihat 6.5.7) |
| Filtered empty | ❌ |

### 6.5.9 `RecurringFormModal`

`<Modal title={initial ? 'Edit Barang Berkala' : 'Tambah Barang Berkala'} width={500}>`

| # | Label | Kontrol | Placeholder / opsi | Error |
|---|---|---|---|---|
| 1 | `Nama Item` | `Input` | `cth. Skincare Moisturizer` | `Nama wajib diisi` |
| 2a | `Kategori` | `Select` | kategori dengan `section !== 'income'` | — |
| 2b | `Dompet (opsional)` | `Select` | opsi pertama **`— Tidak dipilih —`** (value `''`) | — |
| 3 | `Harga (Rp)` | `Input type="number"` | `0` | `Harga harus lebih dari 0` |
| 4 | `Durasi Pemakaian (hari)` | `Input type="number"` + `.shortcuts` | `cth. 45` | `Durasi harus lebih dari 0` |
| 5 | `Tanggal Beli Terakhir (opsional)` | `Input type="date"` | — | — |
| 6 | `Catatan (opsional)` | `Input` | `cth. Merk Somethinc` | — |
| 7 | `Tags (pisahkan dengan koma)` | `Input` | `cth. perawatan, rutin` | — |

Field 2a & 2b dalam `.formGrid` (2 kolom).

**Chip durasi** (`.shortcuts`, di dalam `Field` yang sama, flex wrap, gap 6, `margin-top: 8`):

```css
.shortcutBtn        { padding: 4px 10px; border-radius: 6px;
                      border: 1px solid var(--border); background: var(--bg-2);
                      color: var(--text-3); font-size: 11px; font-weight: 500; }
.shortcutBtn:hover,
.shortcutBtnActive  { background: #4F6EF7; color: #fff; border-color: #4F6EF7; }
```

| Label | Nilai | Hari |
|---|---|---|
| `2 mgg` | `2mgg` | 14 |
| `1 bln` | `1bln` | 30 |
| `1.5 bln` | `1.5bln` | 45 |
| `2 bln` | `2bln` | 60 |
| `3 bln` | `3bln` | 90 |
| `6 bln` | `6bln` | 180 |
| `1 thn` | `1thn` | 365 |

Chip aktif bila `shortcutToDays(s.value) === Number(form.durationDays)` — jadi nilai
yang diketik manual juga menyorot chip yang cocok.

**Estimasi live** — **conditional** `form.lastPurchaseDate && form.durationDays && Number(form.durationDays) > 0`:
(12px `var(--text-4)`, mb 12, `marginTop: -8`)
```
Estimasi habis: {calcNextEstimateDate(lastPurchaseDate, durationDays)}
({formatDuration(durationDays)} dari pembelian)
```

**Submit:** `.saveBtn` — **`Simpan Perubahan`** (edit) / **`Tambah Item`** (tambah).
Full-width, `background:#4F6EF7` → hover `#3B5DE7`, `#fff`, 14px/600, `padding: 12px`,
radius 10, `margin-top: 8`.

**Hapus:** `.deleteBtn` — **hanya** `initial && onDelete` (mode edit).
Full-width, `border: 1px solid #FCA5A5`, `background: transparent`, `color: #DC2626`,
13px/600, `padding: 10px`, radius 10; hover `background: rgba(220,38,38,0.1)`.
Label **`Hapus Item`**. **Tanpa langkah konfirmasi — langsung hapus.**

**Tanpa tombol batal** (tutup lewat `✕` / Escape / backdrop).

### 6.5.10 `RepurchaseModal`

`<Modal title="Konfirmasi Pembelian Ulang" onClose={onClose} width={440}>`

**Blok ringkasan** (`marginBottom: 16`, `padding: '12px 16px'`, `background: var(--bg-3)`,
radius 10):

```
{item.name}                                             ← 15px/600 var(--text-1)
Durasi pakai: {item.durationDays} hari · Harga sebelumnya: {fmtFull(item.amount)}
                                                       ← 12px var(--text-4), mt 4
```

| # | Label | Kontrol | Placeholder / default |
|---|---|---|---|
| 1 | `Tanggal Beli` | `Input type="date"` | default `TODAY` |
| 2 | `Harga (jika berubah)` | `Input type="number"` | `0`, prefilled `String(item.amount)` |
| 3 | `Dompet` | `Select` | nama wallet; default `item.walletId \|\| wallets[0]?.id` |
| 4 | `Buat transaksi pengeluaran otomatis` | checkbox | **default checked** |

**Hint berikutnya** — **conditional** `nextDate` (12px `var(--text-4)`, mb 12):
```
Estimasi habis berikutnya: {nextDate}
```
Dihitung live dari `purchaseDate + item.durationDays`.

```css
.checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px;
            color: var(--text-2); margin-top: 12px; cursor: pointer; }
.checkbox input { width: 16px; height: 16px; accent-color: #4F6EF7; }
```

**Submit:** `.saveBtn` — **`Konfirmasi`**. Tanpa tombol batal.

> ⚠️ **Modal ini tidak punya validasi sama sekali** — tidak ada slot error di field mana pun.

**Efek samping** (di `App.jsx`): perbarui `lastPurchaseDate` / `nextEstimateDate` / `amount`;
bila checkbox aktif, buat transaksi expense dengan `note: 'Beli ulang: {name}'` dan
`tags: ['berkala', ...item.tags]`; toast **`Pembelian ulang berhasil dicatat.`**

### 6.5.11 Responsive

Satu `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.summaryGrid` | → 1 kolom |
| `.summaryCard` | `border-radius: 16px; padding: 16px` |
| `.summaryValue` | 18px/700 → **20px/800** (nilai jadi lebih besar di mobile) |
| `.formGrid` | → 1 kolom |
| `.itemRow` | `flex-wrap: wrap` |
| `.itemRight` | `width: 100%; justify-content: flex-end; margin-top: 8px` (jatuh ke baris sendiri) |
| `.card` | `padding: 16px 20px` → `14px 16px` |
| `.shortcutBtn` | `border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 600` — **pill hanya di mobile** (desktop radius 6px) |
| `.shortcutBtnActive` | dideklarasikan ulang, sama |

**Tidak berubah:** `.sectionTitle`, `.itemMeta`, padding `.emptyState`.

---

## 6.6 Langganan & Tagihan

`src/pages/Subscription/SubscriptionPage.jsx` (296, termasuk `SubscriptionCard` inline
di baris 214) + `SubscriptionPage.module.css` (413) + `SubscriptionFormModal.jsx` (142),
`PayModal.jsx` (57). Helper: `src/utils/subscriptionHelpers.js` (183).

> ⚠️ Halaman ini **belum punya test** — baik `subscriptionHelpers.js` maupun
> `SubscriptionPage.jsx`. Lihat Part 8.17.

### 6.6.1 Konsep Domain

Biaya tetap berulang (**Netflix, Spotify, PLN Listrik, BPJS**) dengan siklus tagihan
`mingguan` / `bulanan` / `tahunan`. Berbeda dari Barang Berkala, barangnya habis pakai.

### 6.6.2 Header

```css
.pageTitle { font-size: 24px; font-weight: 700; flex: 1; text-align: center; }
.addBtn    /* identik dengan RecurringPage: background #4F6EF7 → #3B5DE7,
              padding 10px 18px, radius 10px, 13px/600, color #fff */
```

| Elemen | String |
|---|---|
| `<h1>` | `Langganan & Tagihan` |
| Subtitle | `Kelola langganan dan tagihan berkala (Netflix, Spotify, Listrik, dll)` |
| Tombol | `Tambah` — `<NavIcon name="plus" size={16}/>` |

> Label tombol hanya **`Tambah`**, bukan `Tambah Langganan` (bandingkan Barang Berkala
> yang memakai `Tambah Item`).

### 6.6.3 Urutan

1. `.pageHeader`
2. `.summaryGrid` — 3 kartu
3. `.filters` — 3 tab
4. Empty state — **conditional** `subscriptions.length === 0`
5. Filtered empty state — **conditional** `subscriptions.length > 0 && filteredList.length === 0`
6. `SubscriptionCard` list (`filteredList.map`)
7. Modals

### 6.6.4 Tiga Kartu Ringkasan

Styling identik dengan Barang Berkala (`.summaryCard` radius 16px, `padding: 16px 20px`,
`box-shadow: none`, `border: 1px solid var(--border-2)`).

| # | Label | Nilai | Warna | Sub |
|---|---|---|---|---|
| 1 | `Total Bulanan` | `fmtFull(Math.round(totalMonthly))` | `#4F6EF7` | `dari {N} langganan aktif` |
| 2 | `Total Tahunan` | `fmtFull(Math.round(totalYearly))` | `#A855F7` | `estimasi setahun penuh` |
| 3 | `Jatuh Tempo Segera` | `upcoming.length` | `> 0 ? #DC2626 : #22C55E` | `dalam 7 hari ke depan` |

**Normalisasi siklus** (`subscriptionHelpers.js`) — hanya item **aktif**:

| Siklus | Normalisasi bulanan | Normalisasi tahunan |
|---|---|---|
| `bulanan` | `amount` | `amount × 12` |
| `mingguan` | `amount × 4.33` | `amount × 52` |
| `tahunan` | `amount / 12` | `amount` |

`getUpcomingSubscriptions` = aktif **dan** `_daysUntilDue <= 7`. Karena tidak ada batas
bawah, **langganan yang terlambat ikut terhitung**.

### 6.6.5 Tiga Tab Filter

```css
.filters    { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.filterBtn  { padding: 8px 16px; border-radius: 20px;
              border: 1px solid var(--border); background: transparent;
              color: var(--text-3); font-size: 13px; font-weight: 500; }
.filterBtn:hover { background: var(--bg-3); color: var(--text-2); }
.filterBtnActive { background: var(--bg-3); color: var(--text-1);
                   border-color: transparent; }
```

| key | Label |
|---|---|
| `all` | `Semua` |
| `active` | `Aktif` |
| `inactive` | `Tidak Aktif` |

**Urutan sort tetap:** aktif sebelum tidak aktif, lalu `getDaysUntilDue` menaik
(terlambat dulu).

### 6.6.6 `SubscriptionCard` (komponen inline)

```css
.card       { background: var(--bg-card); border-radius: 16px; padding: 16px 20px;
              box-shadow: none; border: 1px solid var(--border-2);
              margin-bottom: 10px; }
.cardOverdue { border-color: #FCA5A5; }   /* days < 0 */
.cardSoon    { border-color: #FDE68A; }   /* days <= 7 */
.cardRow    { display: flex; align-items: center; gap: 14px; }
.cardIcon   { width: 38px; height: 38px; border-radius: 10px; font-size: 18px;
              background: var(--bg-3); }
.cardInfo   { flex: 1; min-width: 0; }
.cardName   { font-size: 14px; font-weight: 600; color: var(--text-1);
              single-line ellipsis }
.cardMeta   { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
              font-size: 12px; color: var(--text-4); margin-top: 2px; }
.cardRight  { display: flex; align-items: center; gap: 8px; }
.cardAmount { font-size: 13px; font-weight: 600; color: var(--text-2);
              text-align: right; }
.cardCycle  { font-size: 11px; color: var(--text-4); text-align: right; }
.badge      { font-size: 10px; font-weight: 600; padding: 2px 8px;
              border-radius: 6px; white-space: nowrap;
              text-transform: uppercase; letter-spacing: .03em; }
.payBtn     { padding: 6px 12px; border-radius: 8px; border: none;
              background: #22C55E; color: #fff; font-size: 11px;
              font-weight: 600; white-space: nowrap; }
.payBtn:hover { background: #16A34A; }
.actions    { display: flex; gap: 6px; margin-left: 8px; }
.actionBtn  { width: 30px; height: 30px; border-radius: 8px;
              border: 1px solid var(--border); background: var(--bg-2);
              color: var(--text-4); }
.actionBtn:hover { background: var(--bg-3); color: var(--text-2); }
```

**Kiri (`.cardIcon` + `.cardInfo`):**

```
.cardIcon → {catInfo.emoji}                 /* getSubscriptionCategoryInfo(sub.category) */
.cardName → {subscription.name}
.cardMeta → {catInfo.label} · {fmtDate(nextDueDate)} · {badge jatuh tempo}
```

Badge jatuh tempo (`.badge` + modifier, **hanya bila `isActive`**):

| `days` | Class | Teks | Warna |
|---|---|---|---|
| `< 0` | `.badgeOverdue` | `Terlambat {N} hari` | `rgba(220,38,38,0.1)` / `#F87171` |
| `0` | `.badgeSoon` | `Hari ini` | `rgba(217,119,6,0.1)` / `#FBBF24` |
| `1` | `.badgeSoon` | `Besok` | idem |
| `2..7` | `.badgeSoon` | `{N} hari lagi` | idem |
| `> 7` | `.badgeOk` | `{N} hari lagi` | `rgba(22,163,74,0.1)` / `#4ADE80` |

Karena `.badge` memakai `text-transform: uppercase`, semua teks tampil kapital:
`TERLAMBAT 3 HARI`, `HARI INI`, `BESOK`, `5 HARI LAGI`.

**Kanan (`.cardRight`), urutan DOM:**

```
<div>                                  ← wrapper tanpa class
  .cardAmount  → {fmtFull(subscription.amount)}     /* nilai mentah, tidak dibulatkan */
  .cardCycle   → {getBillingCycleLabel(billingCycle)}
</div>
<span.badge.badgeActive|badgeInactive>  → 'Aktif' | 'Tidak Aktif'
{payBtn}                                → 'Bayar'   (hanya bila isActive)
.actions
  button.actionBtn title="Edit"                     → <NavIcon name="edit" size={14}/>
  button.actionBtn title="Non-aktifkan"|"Aktifkan" → <NavIcon name={isActive ? 'close' : 'check'} size={14}/>
```

| Badge status | Class | Teks | Warna |
|---|---|---|---|
| Aktif | `.badgeActive` | `Aktif` | `rgba(22,163,74,0.1)` / `#4ADE80` |
| Tidak aktif | `.badgeInactive` | `Tidak Aktif` | `rgba(100,116,139,0.1)` / `#94A3B8` |

`getBillingCycleLabel(cycle)`: `bulanan → /bulan`, `tahunan → /tahun`,
`mingguan → /minggu`, default `/bulan`.

> ⚠️ **Tidak ada tombol hapus di kartu.** `Hapus Langganan` hanya bisa dijangkau lewat
> Edit → form modal. Lihat Part 8.18.
> ⚠️ **Tidak ada UI tag** — `tags: ['langganan']` ditulis ke transaksi tapi tak pernah
> dirender di halaman ini.

### 6.6.7 Dua Empty State

**A) Data kosong** — `subscriptions.length === 0`

```css
.emptyState { text-align: center; padding: 48px 20px; color: var(--text-4); }
.emptyIcon  { font-size: 48px; margin-bottom: 12px; }
.emptyTitle { font-size: 16px; font-weight: 600; color: var(--text-3);
              margin-bottom: 8px; }
.emptyDesc  { font-size: 13px; color: var(--text-4); max-width: 320px;
              margin: 0 auto 20px; line-height: 1.5; }
```

| Elemen | Isi |
|---|---|
| `.emptyIcon` | `💳` |
| `.emptyTitle` | `Belum ada langganan` |
| `.emptyDesc` | `Tambahkan langganan dan tagihan berkala seperti Netflix, Spotify, Listrik, Internet, BPJS, dll. BudgetX akan menghitung total biaya dan mengingatkan saat jatuh tempo.` |
| Tombol | `<NavIcon name="plus" size={16}/>` + **`Tambah Langganan Pertama`** (`margin: 0 auto`) |

**B) Hasil filter kosong** — `subscriptions.length > 0 && filteredList.length === 0`

| Elemen | Isi |
|---|---|
| `.emptyIcon` | `🔍` |
| `.emptyTitle` | `Tidak ada data` |
| `.emptyDesc` | `Tidak ada langganan dengan filter yang dipilih.` |
| Tombol | **tidak ada** (tidak ada tombol reset filter) |

### 6.6.8 State

| Jenis | Ada? |
|---|---|
| Loading | ❌ |
| Error | ❌ |
| Empty (0 data) | ✅ 2 bentuk (lihat 6.6.7) |
| Filtered empty | ✅ (hanya halaman ini yang memilikinya) |

### 6.6.9 `SubscriptionFormModal`

`<Modal title={initial ? 'Edit Langganan' : 'Tambah Langganan'} onClose={onClose}>`
(width **default 480** — tidak di-override).

Layout baris: field 2+3 dalam `.formGrid` (2 kolom), field 4+5 dalam `.formGrid`
(2 kolom), field 1, 6, 7 full-width.

| # | Label | Kontrol | Placeholder / opsi | Error |
|---|---|---|---|---|
| 1 | `Nama Langganan` | `Input type="text"` | `Netflix, Spotify, PLN Listrik...` | `Nama wajib diisi` |
| 2 | `Kategori` | `Select` | 8 opsi (tabel bawah) | — |
| 3 | `Siklus Tagihan` | `Select` | `Bulanan` · `Tahunan` · `Mingguan` | — |
| 4 | `Jumlah (Rp)` | `Input type="number"` | `79000` | `Jumlah harus lebih dari 0` |
| 5 | `Tanggal Jatuh Tempo` | `Input type="date"` | — | `Tanggal jatuh tempo wajib diisi` |
| 6 | `Dompet Pembayaran` | `Select` | nama wallet | — |
| 7 | `Catatan (Opsional)` | `Input type="text"` | `Catatan tambahan...` | — |

**Opsi `Kategori` (urutan; teks = emoji + spasi + label):**

| value | Teks opsi |
|---|---|
| `streaming` | `🎬 Streaming` |
| `utilitas` | `💡 Utilitas` |
| `internet` | `🌐 Internet & Telepon` |
| `asuransi` | `🛡️ Asuransi` |
| `fitness` | `💪 Fitness & Gym` |
| `cloud` | `☁️ Cloud & Storage` |
| `edukasi` | `📚 Edukasi` |
| `lainnya` | `📦 Lainnya` |

**Opsi `Siklus Tagihan` (urutan):** `Bulanan` (`bulanan`) · `Tahunan` (`tahunan`) ·
`Mingguan` (`mingguan`).

**Default (mode tambah):** `category='lainnya'`, `billingCycle='bulanan'`,
`walletId = wallets[0]?.id || ''`, `nextDueDate=''`, `amount=''`.

> **Tidak ada checkbox "aktif" di form ini.** `isActive` di-carry-over:
> `initial?.isActive !== undefined ? initial.isActive : true`. Mengaktif/nonaktif
> hanya lewat tombol kedua di kartu.

**Validasi** (hanya saat submit, tanpa re-validasi live):
```js
if (!name.trim())                              errs.name        = 'Nama wajib diisi';
if (!amount || Number(amount) <= 0)           errs.amount      = 'Jumlah harus lebih dari 0';
if (!nextDueDate)                             errs.nextDueDate = 'Tanggal jatuh tempo wajib diisi';
```
Tidak ada validasi kategori, siklus, dompet, atau catatan. Tidak ada `maxLength`.

**Tombol:**

| Tombol | Label | Syarat | Perilaku |
|---|---|---|---|
| `.saveBtn` (`type="submit"`) | `Simpan Perubahan` (edit) / `Tambah Langganan` (tambah) | selalu | `preventDefault` → `validate()` → `onSave(...)` |
| `.deleteBtn` (`type="button"`) | `Hapus Langganan` → `Yakin hapus?` | `initial && onDelete` | 2-klik; **tidak ada cara batal** |

```css
.saveBtn  { width: 100%; padding: 12px; border-radius: 10px; border: none;
            background: #4F6EF7; color: #fff; font-size: 14px;
            font-weight: 600; margin-top: 8px; }
.saveBtn:hover { background: #3B5DE7; }
.deleteBtn { width: 100%; padding: 10px; border-radius: 10px;
             border: 1px solid #FCA5A5; background: transparent;
             color: #DC2626; font-size: 13px; font-weight: 600; }
.deleteBtn:hover { background: rgba(220,38,38,0.1); }
```

Payload: `{ name: name.trim(), category, amount: Number(amount), billingCycle,
nextDueDate, walletId, note: note.trim(), isActive: … }`

### 6.6.10 `PayModal`

`<Modal title="Bayar Langganan" onClose={onClose} width={400}>`

**Blok ringkasan** (inline: `marginBottom: 16`, `padding: '12px 16px'`,
`background: var(--bg-3)`, `borderRadius: 10`):
```
{subscription.name}                    ← 14px/600 var(--text-1)
{fmtFull(subscription.amount)}          ← 18px/700 #4F6EF7, marginTop 4
```

| # | Label | Kontrol | Default |
|---|---|---|---|
| 1 | `Tanggal Pembayaran` | `Input type="date"` | `new Date().toISOString().slice(0,10)` (hari ini) |
| 2 | `Dompet` | `Select` | `subscription.walletId \|\| wallets[0]?.id \|\| ''` |
| 3 | `Update tanggal jatuh tempo berikutnya` | checkbox `.checkbox` | **`true`** (tercentang) |

**Submit:** `.saveBtn` (`marginTop: 16`) — **`Konfirmasi Pembayaran`**

> ⚠️ **Tidak ada validasi sama sekali.** `handleSubmit` hanya `preventDefault` lalu
> `onConfirm({date, walletId, advanceDueDate: advanceDue})`. `walletId: ''` dan tanggal
>lampau bisa terkirim.
> ⚠️ Tidak ada helper text yang menjelaskan kapan tanggal jatuh tempo berikutnya.
> ⚠️ Checkbox default `true` — membayar langganan yang belum jatuh tempo akan
> **mendorong** tanggal jatuh tempo secara diam-diam. Lihat Part 8.19.

**Efek samping** (`App.jsx:handlePaySubscription`): buat transaksi lewat
`buildSubscriptionTransaction`, perbarui `lastPaidDate`; bila checkbox aktif, juga
`nextDueDate = advanceDueDate(nextDueDate, billingCycle)`.
`advanceDueDate`: `bulanan → +1 bulan`, `tahunan → +1 tahun`, `mingguan → +7 hari`.
Toast: **`Pembayaran langganan berhasil dicatat.`**

### 6.6.11 `buildSubscriptionTransaction` (helper)

```js
{
  date,                      // tanggal bayar
  walletId,
  type: 'expense',
  categoryId: 'c10',         // ⚠️ hardcoded — kategori "Langganan", Part 8.8
  amount: subscription.amount,
  note: `Bayar ${subscription.name}`,
  tags: ['langganan'],
}
```

### 6.6.12 Responsive

**Satu** `@media (max-width: 768px)` di seluruh file.

| Selektor | Perubahan |
|---|---|
| `.summaryGrid` | `3 × 1fr` → `1fr` (3 kartu stack) |
| `.summaryCard` | `padding: 16px 20px` → `16px` |
| `.summaryValue` | 18px/700 → **20px/800** |
| `.formGrid` | `2 × 1fr` → `1fr` |
| `.cardRow` | → `flex-wrap: wrap` |
| `.cardRight` | `width: 100%; justify-content: flex-end; margin-top: 8px` |
| `.card` | `padding: 16px 20px` → `14px 16px` |
| `.filterBtn` | 13px/500 → **12px/600** |
| `.filterBtnActive` | **di-override** jadi filled: `background:#4F6EF7; color:#fff; border-color:#4F6EF7; border-radius:20px` |

> **Perhatikan `.filterBtnActive`:** di desktop state aktif bersifat netral
> (`--bg-3`), di mobile berubah jadi **filled accent**. Perilaku visual berbeda
> antar breakpoint. Lihat Part 7.4.

**Tidak berubah:** `.pageHeader`, `.filters`, `.cardIcon` (38px), `.cardMeta`,
`.emptyIcon` (48px), `.emptyDesc` (320px), `.saveBtn`, `.deleteBtn`, `.payBtn`.

---

## 6.7 Utang/Piutang

`src/pages/Debt/DebtPage.jsx` (369) + `DebtPage.module.css` (468)
+ `DebtFormModal.jsx` (298), `PaymentModal.jsx` (198).

### 6.7.1 Konsep Domain

**Dua sisi:** `utang` (saya pinjam uang) dan `piutang` (saya pinjamkan uang).
Kata-kata cermin di setiap titik sentuh. Mendukung **amortisasi anuitas** (suku bunga
tahunan + tenor) dengan jadwal cicilan.

| `type` | Glyph | Warna ikon | Label form | Label pembayaran |
|---|---|---|---|---|
| `utang` | `↓` | `rgba(220,38,38,0.08)` / `#DC2626` | `Utang (saya pinjam)` | `Utang ke {nama}` |
| `piutang` | `↑` | `rgba(37,99,235,0.08)` / `#2563EB` | `Piutang (saya pinjamkan)` | `Piutang dari {nama}` |

### 6.7.2 Header

CSS `.pageHeader` / `.pageTitle` (24px/700) / `.pageSubtitle` **byte-identik** dengan
InvestmentPage.

| Elemen | String |
|---|---|
| `<h1>` | `Utang/Piutang` |
| Subtitle | `Kelola catatan utang dan piutang Anda` |
| Tombol | `Tambah` — `<NavIcon name="plus" size={16}/>` · `.addBtn` |

```css
.addBtn { display: flex; align-items: center; gap: 6px; padding: 10px 18px;
          border-radius: 10px; border: none; background: #4F6EF7;
          color: #fff; font-size: 13px; font-weight: 600; }
.addBtn:hover { background: #3B5DE7; }
```

### 6.7.3 Urutan

1. `.pageHeader`
2. `.summaryGrid` — 3 kartu (**selalu**)
3. `.filters` — 5 tab (**selalu**, bahkan saat 0 data)
4. `.emptyState` — **conditional** `debts.length === 0`
5. `DebtCard` list (`filteredDebts`)
6. `DebtFormModal` / `PaymentModal`

### 6.7.4 Tiga Kartu Ringkasan

```css
.summaryGrid { display: grid; grid-template-columns: repeat(3, 1fr);
               gap: 14px; margin-bottom: 24px; }
.summaryCard { background: var(--bg-card); border-radius: 16px; padding: 16px 20px;
               border: 1px solid var(--border-2);
               transition: background .2s, border-color .2s; }
.summaryLabel{ font-size: 11px; font-weight: 600; color: var(--text-5);
               text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
.summaryValue{ font-size: 18px; font-weight: 700; color: var(--text-1); }
.summarySub  { font-size: 12px; color: var(--text-4); margin-top: 4px; }
```

| # | Label | Nilai | Warna | Sub |
|---|---|---|---|---|
| 1 | `Total Utang` | `fmtFull(summary.totalUtang)` | `#DC2626` | `yang harus dibayar` |
| 2 | `Total Piutang` | `fmtFull(summary.totalPiutang)` | `#2563EB` | `yang akan diterima` |
| 3 | `Posisi Bersih` | `fmtFull(summary.netPosition)` | `>= 0 ? #22C55E : #DC2626` | `piutang − utang` |

Menggunakan **`remainingAmount`** (bukan `totalAmount`), hanya record
`status === 'active'`. `netPosition = totalPiutang − totalUtang`.

> Sub-kartu 3 memakai tanda minus tipografis U+2212 (`−`), bukan hyphen.

### 6.7.5 Lima Tab Filter

```css
.filters    { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.filterBtn  { padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border);
              background: transparent; color: var(--text-3);
              font-size: 13px; font-weight: 500; }
.filterBtn:hover { background: var(--bg-3); color: var(--text-2); }
.filterBtnActive { background: var(--bg-3); color: var(--text-1);
                   border-color: transparent; }
```

| key | Label | Filter |
|---|---|---|
| `all` | `Semua` | — (default) |
| `utang` | `Utang` | `type === 'utang'` |
| `piutang` | `Piutang` | `type === 'piutang'` |
| `active` | `Aktif` | `status === 'active'` |
| `settled` | `Lunas` | `status === 'settled'` |

Hasil lalu `sortDebtsByDate` → `createdAt` **descending** (`localeCompare`).

### 6.7.6 Empty State

> Dipicu oleh `debts.length === 0` (**array mentah**), bukan `filteredDebts`. Jadi
> memfilter ke subset kosong **tidak menampilkan apa pun** — tidak ada empty state
> sekunder.

```css
.emptyState { text-align: center; padding: 48px 20px; color: var(--text-4); }
.emptyIcon  { font-size: 48px; margin-bottom: 12px; }
.emptyTitle { font-size: 16px; font-weight: 600; color: var(--text-3);
              margin-bottom: 8px; }
.emptyDesc  { font-size: 13px; max-width: 320px; margin: 0 auto 20px;
              line-height: 1.5; }
```

| Elemen | Isi |
|---|---|
| `.emptyIcon` | `📋` |
| `.emptyTitle` | `Belum ada catatan utang/piutang` |
| `.emptyDesc` | `Catat utang dan piutang Anda di sini. BudgetX akan otomatis membuat transaksi dan memperbarui saldo dompet.` |
| Tombol | `<NavIcon name="plus" size={16}/>` + **`Tambah Pertama`** (`margin: 0 auto`) |

### 6.7.7 `DebtCard` (komponen inline)

```css
.card        { background: var(--bg-card); border-radius: 16px; padding: 16px 20px;
               border: 1px solid var(--border-2);
               transition: background .2s, border-color .2s; margin-bottom: 10px; }
.cardOverdue { border-color: #FCA5A5; }   /* daysUntilDue < 0 && status === 'active' */
.cardRow     { display: flex; align-items: center; gap: 14px; }
.cardIcon    { width: 38px; height: 38px; border-radius: 10px;
               font-size: 16px; font-weight: 700; flex-shrink: 0; }
.cardInfo    { flex: 1; min-width: 0; }
.cardName    { font-size: 14px; font-weight: 600; color: var(--text-1);
               single-line ellipsis }
.cardMeta    { display: flex; align-items: center; gap: 8px;
               font-size: 12px; color: var(--text-4); margin-top: 2px; }  /* ⚠️ tanpa wrap */
.cardRight   { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.cardAmount  { font-size: 13px; font-weight: 600; color: var(--text-2);
               text-align: right; }
.cardRemaining { font-size: 11px; color: var(--text-4); text-align: right; }
.progressWrap { width: 80px; height: 6px; background: var(--bg-3);
                border-radius: 3px; overflow: hidden; }
.progressBar  { height: 100%; border-radius: 3px; transition: width .3s;
                /* width: min(100, progress)%;
                  background: status === 'settled' ? '#22C55E' : '#4F6EF7' */ }
.payBtn     { padding: 6px 12px; border-radius: 8px; border: none;
              background: #22C55E; color: #fff; font-size: 11px;
              font-weight: 600; white-space: nowrap; }
.payBtn:hover { background: #16A34A; }
.actions    { display: flex; gap: 6px; margin-left: 8px; }
.actionBtn  { width: 30px; height: 30px; border-radius: 8px;
              border: 1px solid var(--border); background: var(--bg-2);
              color: var(--text-4); }
```

**Kiri:**

```
.cardIcon  → utang '↓' / piutang '↑'  (bg & color sesuai tabel 6.7.1)
.cardName  → {debt.personName}
.cardMeta  → [badge] … [Jatuh tempo: {fmtDate(dueDate)}]
```

**Badge di `.cardMeta`** (urutan render):

| Syarat | Class | Teks | Warna |
|---|---|---|---|
| `type === 'utang'` | `.badge.badgeUtang` | `Utang` | `rgba(220,38,38,0.1)` / `#F87171` |
| `type === 'piutang'` | `.badge.badgePiutang` | `Piutang` | `rgba(37,99,235,0.1)` / `#60A5FA` |
| `isAnnuityDebt` | `.badge` (**inline style saja**) | `{rate}% Anuitas` | `rgba(217,119,6,0.1)` / `#FBBF24` |
| `status === 'settled'` | `.badge.badgeSettled` | `Lunas` | `rgba(22,163,74,0.1)` / `#4ADE80` |
| `isOverdue` | `.badge.badgeOverdue` | `Terlambat` | `rgba(217,119,6,0.1)` / `#FBBF24` |
| `dueDate` truthy | `<span>` biasa | `Jatuh tempo: {fmtDate(dueDate)}` | inherit |

```css
.badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 6px;
         white-space: nowrap; text-transform: uppercase; letter-spacing: .03em; }
```

`isAnnuityDebt = debt.interestEnabled || (debt.interestRate > 0 && debt.tenorMonths > 0)`

**Sub-baris cicilan anuitas** — **conditional** `isAnnuityDebt && status==='active' && installmentInfo`
(penuh inline, tanpa class CSS, 11px `var(--text-4)`, mt 4):
```
Cicilan ke-{month}: {fmtFull(total)}/bln
(Pokok {fmtFull(principal)} + Bunga {fmtFull(interest)})
```
Dirender sebagai satu baris (JSX menyisipkan newline + `(` yang runtuh jadi spasi).

**Kanan:**

```
.cardAmount    → {fmtFull(debt.totalAmount)}         /* pokok awal */
.cardRemaining → 'Sisa pokok: {fmtFull(debt.remainingAmount)}'
.progressWrap  → progress = totalAmount > 0
                  ? ((totalAmount - remainingAmount) / totalAmount) * 100 : 0
                (TIDAK ADA label % — bar unlabeled)
.payBtn        → 'Bayar'   (hanya bila status === 'active')
.actions       → 1× actionBtn title="Edit" → <NavIcon name="edit" size={14}/>
```

> **Tidak ada tombol hapus di kartu** — hapus hanya di dalam form modal.

### 6.7.8 Disclosure: Tabel Amortisasi

**Hanya untuk utang anuitas.** Dihitung inline via
`generateAmortizationSchedule(totalAmount, interestRate, tenorMonths, startDate || createdAt || '')`;
`null` bila `schedule.length === 0`.

**Tombol toggle** (`.toggleBtn`, `background: none; border: none; color: var(--text-4)`,
11px, `padding: 4px 0`; hover `var(--text-2)`):
```
showSchedule ? '▲ Sembunyikan jadwal' : '▼ Tabel amortisasi'
+ ' ({schedule.length} bulan)'
```

**Panel** memakai `.paymentHistory` (`margin-top: 12px; padding-top: 12px;
border-top: 1px solid var(--border-2)`) dengan `.paymentHistoryTitle`
(11px/600 `var(--text-5)` uppercase `.04em`) = **`Jadwal Amortisasi`**.

**Tabel — `<table>` dengan inline style**, dibungkus `<div style={{overflowX:'auto'}}>`:
`width: 100%`, `fontSize: 11`, `borderCollapse: collapse`;
`thead tr` `borderBottom: 1px solid var(--border-2)`;
`th` `padding: '4px 6px'`, `color: var(--text-4)`.

| Kolom | `th` | Align `td` | Isi | Warna |
|---|---|---|---|---|
| 1 | `Bln` | kiri | `{row.month}` + `' ✓'` bila sudah dibayar | — |
| 2 | `Pokok` | kanan | `fmtFull(row.principal)` | — |
| 3 | `Bunga` | kanan | `fmtFull(row.interest)` | `#D97706` |
| 4 | `Total` | kanan | `fmtFull(row.total)` | `fontWeight: 600` |
| 5 | `Sisa` | kanan | `fmtFull(row.remainingPrincipal)` | — |

Baris terbayar: `background: rgba(34,197,94,0.04)`, `color: var(--text-4)`.
Baris belum: `background: transparent`, `color: var(--text-2)`.
`isPaid = i < (debt.payments || []).length` — **berdasarkan posisi, bukan tanggal**.

> `row.date` dihitung tapi **tidak pernah ditampilkan**. Lihat Part 8.20.

### 6.7.9 Disclosure: Riwayat Pembayaran

**Hanya** bila `debt.payments && debt.payments.length > 0`.

**Toggle:** `showHistory ? '▲ Sembunyikan' : '▼ Riwayat pembayaran'` + ` ({n})`
**Judul panel:** **`Riwayat Pembayaran`**

Tiap baris = `.paymentItem` (flex `space-between`, `padding: 6px 0`, 12px `var(--text-3)`):
`.paymentItemDate` (`var(--text-4)`) `fmtDate(p.date)` · `p.note || '—'` ·
`.paymentItemAmount` (600, `var(--text-2)`) `fmtFull(p.amount)`

Bila `p.interestPart > 0`, ada `<span>` bersarang (10px, `var(--text-4)`, `display: block`):
```
Pokok {fmtFull(p.principalPart)} + Bunga {fmtFull(p.interestPart)}
```

### 6.7.10 `DebtFormModal`

`<Modal title={initial ? 'Edit Utang/Piutang' : 'Tambah Utang/Piutang'} width={520}>`

`hasPayments = initial?.payments?.length > 0` → **mengunci** sebagian field.

| # | Label | Kontrol | Placeholder / opsi | Error | Terkunci? |
|---|---|---|---|---|---|
| 1 | `Tipe` | 2 radio `name="debtType"` | `Utang (saya pinjam)` · `Piutang (saya pinjamkan)` | `type` | ya |
| 2 | `Nama Orang` | `Input` | `cth. Budi, Bank BCA` | `personName` | tidak |
| 3 | `Jumlah Pokok (Rp)` | `Input type="number"` | `0` | `totalAmount` | ya |
| 4 | `Dompet` | `Select` | nama wallet | `walletId` | tidak |
| 5 | `Pakai Bunga (Anuitas)` | checkbox | — | — | ya (hanya render bila `!hasPayments`) |
| 6 | `Bunga per Tahun (%)` | `Input type="number"` | `8` | `interestRate` | ya |
| 7 | `Tenor (bulan)` | `Input type="number"` | `12` | `tenorMonths` | ya |
| 8 | `Tanggal Mulai Cicilan` | `Input type="date"` | — | — | ya |
| 9 | `Tanggal Jatuh Tempo (opsional)` | `Input type="date"` | — | `dueDate` | tidak |
| 10 | `Keterangan (opsional)` | `Input` | `cth. KPR, Pinjaman Bank` | — | tidak |

Field 3+4 dalam `.formGrid`; field 6+7 dalam `.formGrid`.
Default: `type='utang'`, `walletId = initial?.walletId || wallets[0]?.id || ''`,
`interestRate='8'`, `tenorMonths='12'`, `startDate=TODAY`.

```css
.radioGroup { display: flex; gap: 12px; margin-bottom: 4px; }
.radioLabel { display: flex; align-items: center; gap: 6px; font-size: 13px;
              color: var(--text-2); cursor: pointer; }
.radioLabel input { accent-color: #4F6EF7; }
```

**Panel preview anuitas** — **conditional** `preview` truthy
(`padding: '12px 16px'`, `background: rgba(79,110,247,0.08)`, radius 10,
`border: 1px solid rgba(79,110,247,0.2)`, mb 16):

Judul: **`📊 Preview Cicilan Anuitas`** (12px/600 `var(--text-2)`, mb 8)
Grid 2 kolom (`1fr 1fr`, gap 8, 12px `var(--text-3)`):

| Label | Nilai | Weight |
|---|---|---|
| `Cicilan/bulan:` | `fmtFull(preview.installment)` | 700 |
| `Total bunga:` | `fmtFull(preview.totalInterest)` | 700 |
| `Total bayar:` | `fmtFull(preview.totalPayment)` | 700 |
| `Pokok:` | `fmtFull(Number(form.totalAmount))` | normal |

Disembunyikan bila `!interestEnabled` atau salah satu dari
`totalAmount / tenorMonths / interestRate` falsy, atau `principal<=0 || tenor<=0`.

**Panel bunga read-only** — **conditional** `hasPayments && initial?.interestEnabled`
(`padding: '10px 14px'`, `background: var(--bg-3)`, radius 8, mb 16, 12px `var(--text-3)`):
```
Bunga {rate}%/tahun · Tenor {tenor} bulan · Cicilan {fmtFull(monthlyInstallment)}/bulan
```

**Validasi — routing berbasis substring** dari `validateDebt(data, hasPayments)`:

| Pesan validator | Cek | Field tujuan |
|---|---|---|
| `Nama orang wajib diisi` | `error.includes('Nama')` | `personName` |
| `Tipe harus utang atau piutang` | `error.includes('Tipe')` | `type` |
| `Jumlah harus lebih dari 0` | `error.includes('Jumlah')` | `totalAmount` |
| `Dompet wajib dipilih` | `error.includes('Dompet')` | `walletId` |
| `Format tanggal jatuh tempo tidak valid (YYYY-MM-DD)` | `error.includes('tanggal')` | `dueDate` |
| fallback | `else` | `_general` |

> ⚠️ Routing ini **patah diam-diam** bila teks validator diubah. Lihat Part 8.21.
> `type` dan `totalAmount` hanya divalidasi bila `hasPayments === false`.

Validasi bunga **inline** (melewati validator, `setErrors` mengganti objek):
`Bunga harus lebih dari 0` → `errors.interestRate`;
`Tenor harus lebih dari 0` → `errors.tenorMonths`.

`_general` dirender sebagai `<div style={{color: '#DC2626', fontSize: 12, marginBottom: 8}}>`
— **warna berbeda dari `Field` yang pakai `#EF4444`**. Lihat Part 8.22.

**Tombol:**

| Tombol | Label | Syarat | Perilaku |
|---|---|---|---|
| `.saveBtn` | `Simpan Perubahan` (edit) / `Tambah` (tambah) | selalu | — |
| `.deleteBtn` | `Hapus` → `Yakin hapus?` | `initial && onDelete` | 2-klik |

`.saveBtn`: full-width, `padding: 12px`, radius 10, `border: none`,
`background:#4F6EF7` → hover `#3B5DE7`, `#fff`, 14px/600, `margin-top: 8px`.
`.deleteBtn`: full-width, `padding: 10px`, `border: 1px solid #FCA5A5`,
`background: transparent` → hover `rgba(220,38,38,0.1)`, `color: #DC2626`, 13px/600.

**Payload saat `hasPayments`:** field `type, totalAmount, interestEnabled, interestRate,
tenorMonths, startDate, monthlyInstallment, schedule` **dihapus** dari payload — record
terkunci hanya bisa mengubah `personName`, `walletId`, `dueDate`, `description`.

### 6.7.11 `PaymentModal`

`<Modal title="Catat Pembayaran" width={440}>`
`isAnnuityDebt = !!getCurrentInstallmentInfo(debt)`

**Blok identitas utang** (inline: `marginBottom: 16`, `padding: '12px 16px'`,
`background: var(--bg-3)`, radius 10):
```
{type === 'utang' ? 'Utang ke' : 'Piutang dari'} {debt.personName}    ← 14px/600 var(--text-1)
Sisa pokok: {fmtFull(debt.remainingAmount)} dari {fmtFull(debt.totalAmount)}
                                                                      ← 12px var(--text-4), mt 4
Bunga {rate}%/tahun · Tenor {tenor} bulan                            ← 11px var(--text-4), mt 2 (anuita saja)
```

**Panel rincian anuitas** — **hanya** bila anuitas
(`padding: '12px 16px'`, `background: rgba(245,158,11,0.08)`, radius 10,
`border: 1px solid rgba(245,158,11,0.2)`, mb 16):

Judul: **`📋 Cicilan Bulan ke-{month}`** (12px/600 `var(--text-2)`, mb 6)
Grid 2 kolom (`1fr 1fr`, gap 4, 12px `var(--text-3)`):

| Label | Nilai | Weight | Border atas |
|---|---|---|---|
| `Pokok:` | `fmtFull(installmentInfo.principal)` | 600 | — |
| `Bunga:` | `fmtFull(installmentInfo.interest)` | 600 | — |
| `Total cicilan:` | `fmtFull(installmentInfo.total)` | 700 | ✅ (dua sel terakhir) |

Helper (11px `var(--text-4)`, mt 8, lineHeight 1.4):
```
💡 Dari {fmtFull(total)} yang dibayar, hanya {fmtFull(principal)} yang mengurangi
   pokok. Sisanya ({fmtFull(interest)}) adalah bunga.
```

**Field:**

| # | Label | Kontrol | Placeholder | Error |
|---|---|---|---|---|
| 1 | `Jumlah Pembayaran (Rp)` | `Input type="number"` | `0` | `amount` |
| 2 | `Tanggal` | `Input type="date"` | — (dalam `.formGrid`) | `date` |
| 3 | `Dompet` | `Select` | nama wallet | — |
| 4 | `Catatan (opsional)` | `Input` | `cth. Cicilan ke-2` | — |

Field 2+3 dalam `.formGrid`. Default: `amount = installmentInfo ? String(total) : ''`,
`date = TODAY`, `walletId = debt.walletId || wallets[0]?.id || ''`,
`note = installmentInfo ? `Cicilan ke-${month}` : ''`.

**Tombol "bayar penuh"** —-inline button di bawah input jumlah, **di dalam `Field` yang
sama** (jadi secara visual tetap di bawah input, di bawah label kapital):

```js
{ marginTop: 6, padding: '4px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-2)',
  color: 'var(--text-3)', fontSize: 11, cursor: 'pointer',
  fontFamily: 'inherit' }   // type="button"
```

| Kondisi | Label | Efek |
|---|---|---|
| `isAnnuityDebt` | `Bayar Cicilan ({fmtFull(total)})` | `amount = String(installmentInfo.total)` |
| flat | `Bayar Lunas ({fmtFull(debt.remainingAmount)})` | `amount = String(debt.remainingAmount)` |

**Validasi — dua cabang:**

*Anuitas* (melewati `validatePayment` sepenuhnya):

| Kondisi | Pesan | Field |
|---|---|---|
| `amount <= 0` | `Jumlah pembayaran harus lebih dari 0` | `amount` |
| `!/^\d{4}-\d{2}-\d{2}$/.test(date)` | `Tanggal wajib diisi` | `date` |

*Flat* (`validatePayment(payment, debt.remainingAmount)`), substring-routed:

| Pesan | Cek | Field |
|---|---|---|
| `Jumlah pembayaran harus lebih dari 0` | `includes('Jumlah')` | `amount` |
| `Jumlah pembayaran melebihi sisa utang/piutang` | `includes('melebihi')` | `amount` |
| `Tanggal pembayaran wajib diisi (format YYYY-MM-DD)` | `includes('Tanggal')` | `date` |
| fallback | | `_general` |

**Submit:** `.saveBtn` — **`Catat Pembayaran`**. Tanpa tombol batal.

> ⚠️ **Inkonsistensi model bunga.** Kartu menampilkan jadwal dari
> `generateAmortizationSchedule` (anuitas sejati), tapi jalur tulis di
> `PaymentModal.jsx:77-84` menghitung bunga **flat** atas sisa pokok:
> ```js
> const monthlyRate = (debt.interestRate || 0) / 100 / 12;
> const interestPart = Math.round(debt.remainingAmount * monthlyRate);
> const principalPart = Math.max(0, paymentData.amount - interestPart);
> ```
> `principalPart` diturunkan dari angka yang diketik user, bukan dibaca dari baris jadwal.
> Lihat Part 8.23.

### 6.7.12 Responsive

**Satu** `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.summaryGrid` | → 1 kolom |
| `.summaryCard` | `border-radius: 16px; padding: 16px` |
| `.summaryValue` | 18px/700 → **20px/800** |
| `.formGrid` | → 1 kolom |
| `.cardRow` | `flex-wrap: wrap` |
| `.cardRight` | `width: 100%; justify-content: flex-end; margin-top: 8px` |
| `.card` | `border-radius: 16px; padding: 14px 16px` |
| `.filterBtn` | 13px/500 → 12px/600 |
| `.filterBtnActive` | **di-override** jadi filled accent (sama seperti Langganan) |

**Tidak berubah:** `.cardMeta` **tidak punya `flex-wrap`** — baris meta yang berisi 5
badge bisa meluber di layar sempit. `.progressWrap` tetap 80px.

---

## 6.8 Investasi

`src/pages/Debt/../Investment/InvestmentPage.jsx` (356) + `InvestmentPage.module.css` (453)
+ `InvestmentFormModal.jsx` (171), `BuyModal.jsx` (115), `SellModal.jsx` (119),
`UpdateValueModal.jsx` (47).

### 6.8.1 Konsep Domain

8 jenis aset dengan model berbeda. Yang paling khas: **deposito** — bunga berjalan
otomatis (nilai accrue sendiri, tidak bisa di-revaluasi manual) — dan **`unit`** untuk
aset yang bisa dibeli/dijual sebagian (saham, crypto, emas, reksadana).

| `assetType` | Label UI |
|---|---|
| `deposito` | `Deposito` |
| `saham` | `Saham` |
| `crypto` | `Crypto` |
| `emas` | `Emas` |
| `reksadana` | `Reksadana` |
| `obligasi` | `Obligasi` |
| `p2p` | `P2P Lending` |
| `lainnya` | `Lainnya` |

### 6.8.2 Header

CSS **byte-identik** dengan DebtPage.

| Elemen | String |
|---|---|
| `<h1>` | `Investasi` |
| Subtitle | `Kelola portofolio investasi Anda` |
| Tombol | `Tambah` — `<NavIcon name="plus" size={16}/>` · `.addBtn` |

### 6.8.3 Urutan

1. `.pageHeader`
2. `.summaryGrid` — 4 kartu — **conditional** `investments.length > 0`
3. `.filters` — 9 tab — **selalu**, bahkan saat 0 data
4. `.emptyState` — **conditional** `investments.length === 0`
5. `InvestmentCard` list (`filtered`)
6. `InvestmentFormModal` / `BuyModal` / `SellModal` / `UpdateValueModal`

### 6.8.4 Empat Kartu Ringkasan

```css
.summaryGrid { display: grid; grid-template-columns: repeat(4, 1fr);
               gap: 14px; margin-bottom: 24px; }
```

| # | Label | Nilai | Warna | Sub |
|---|---|---|---|---|
| 1 | `Total Nilai` | `fmtFull(summary.totalValue)` | *(inherit)* | `nilai pasar saat ini` |
| 2 | `Total Modal` | `fmtFull(summary.totalCostBasis)` | *(inherit)* | `total investasi` |
| 3 | `Profit/Loss` | `{gain >= 0 ? '+' : ''}{fmtFull(totalUnrealizedGain)}` | `>=0 ? #22C55E : #EF4444` | `unrealized gain/loss` |
| 4 | `Return` | `{pct >= 0 ? '+' : ''}{totalReturnPercentage.toFixed(1)}%` | `>=0 ? #22C55E : #EF4444` | `persentase return` |

> **Karet tanda `+`:** ditambahkan **sebelum** `fmtFull`, jadi positif tampil
> `+Rp1.500.000` (tanda `+` mendahului `Rp`).
> ⚠️ Kartu 3/4 pakai `#EF4444` untuk negatif, sementara DebtPage pakai `#DC2626` untuk
> semantik yang sama. Lihat Part 8.4.
> `allocationByType` **dihitung tapi tidak pernah dirender** di halaman ini.

### 6.8.5 Sembilan Tab Filter

```css
.filters    { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
```

| key | Label |
|---|---|
| `null` | `Semua` |
| `deposito` | `Deposito` |
| `saham` | `Saham` |
| `crypto` | `Crypto` |
| `emas` | `Emas` |
| `reksadana` | `Reksadana` |
| `obligasi` | `Obligasi` |
| `p2p` | `P2P` |
| `lainnya` | `Lainnya` |

> **Inkonsistensi label:** chip filter ditulis **`P2P`**, sementara badge kartu dan
> `<select>` di form keduanya **`P2P Lending`**. Lihat Part 8.4.

`activeFilter === null` = default **dan** key `Semua`, jadi chip `Semua` benar-benar
menyala saat load (`===` ketat bekerja karena `f.key` literal `null`).

Filtering hanya per tipe (`filterInvestments(investments, assetType)`) — **tanpa sort**;
urutan kartu = urutan array.

### 6.8.6 Empty State

| Elemen | Isi |
|---|---|
| `.emptyIcon` | `📈` |
| `.emptyTitle` | `Belum ada investasi` |
| `.emptyDesc` | `Catat investasi Anda di sini. BudgetX akan otomatis melacak profit/loss dan membuat transaksi di dompet.` |
| Tombol | `<NavIcon name="plus" size={16}/>` + **`Tambah Pertama`** (`margin: 0 auto`) |

CSS identik dengan DebtPage. **9 chip filter tetap render di atas empty state** (dan
masih fungsional — memilih chip tidak menghilangkan empty state, karena gate-nya di
array mentah).

### 6.8.7 `InvestmentCard` (komponen inline)

CSS **identik** dengan `DebtCard`, kecuali 5 hal:

| Selektor | Bedanya dari Debt |
|---|---|
| `.cardMeta` | **menambahkan `flex-wrap: wrap`** (Debt tidak punya) |
| `.actions` | `gap: 6px` **tanpa** `margin-left` (Debt punya `margin-left: 8px`) |
| `.actionBtn` | **pill teks** (`padding: 5px 10px; border-radius: 7px; font-size: 11px; font-weight: 500; white-space: nowrap`), bukan kotak ikon 30×30 |
| `.cardRemaining` | bernama **`.cardSub`** (11px `var(--text-4)`, rata kanan) |
| `.txItemDate` | punya **`min-width: 80px`** (Debt tidak) |

```css
.cardIcon    /* 38×38, radius 10, background '#4F6EF718', color '#4F6EF7', isi '📊' */
.badgeType   /* bg rgba(79,110,247,0.1),  color #60A5FA */
.badgeGain   /* bg rgba(22,163,74,0.1),   color #4ADE80 */
.badgeLoss   /* bg rgba(220,38,38,0.1),   color #F87171 */
.badgeMatured/* bg rgba(217,119,6,0.1),   color #FBBF24 */
.actionBtnBuy  { background: rgba(22,163,74,0.1);  color: #4ADE80;
                  border-color: rgba(22,163,74,0.2); }
.actionBtnBuy:hover  { background: rgba(22,163,74,0.18); }
.actionBtnSell { background: rgba(220,38,38,0.1);  color: #F87171;
                  border-color: rgba(220,38,38,0.2); }
.actionBtnSell:hover { background: rgba(220,38,38,0.18); }
```

> **Ikon selalu `📊` untuk semua jenis aset** — tidak ada ikon per tipe.
> Hover `Beli`/`Jual` **tidak mengubah warna teks**, hanya background.

**Kiri:**

```
.cardIcon  → '📊'
.cardName  → {investment.name}
.cardMeta  → [badge tipe] [tickerSymbol] [coinName] [{totalUnits} unit] [badge gain/loss] [badge matured]
             [Jatuh tempo: {fmtDate(dueDate)}]  ← sub-baris deposito, inline style
```

| Elemen `.cardMeta` | Syarat | Isi |
|---|---|---|
| badge tipe | selalu | `ASSET_TYPE_LABELS[assetType] \|\| assetType` |
| `<span>` | `tickerSymbol` | `{tickerSymbol}` |
| `<span>` | `coinName` | `{coinName}` |
| `<span>` | `totalUnits > 0 && !isDeposito` | `{totalUnits} unit` — **tidak** jamak |
| badge gain/loss | `metrics.unrealizedGain !== 0` | `{gain>=0?'+':''}{returnPercentage.toFixed(1)}%` |
| badge matured | `maturityInfo && daysLeft <= 0` | `Jatuh Tempo` |

**Sub-baris deposito** — **conditional** `isDeposito && maturityInfo && daysLeft > 0`
(11px `var(--text-4)`, mt 4):
```
{daysLeft} hari lagi · Proyeksi bunga: {fmtFull(projectedReturn)}
```

**Kanan:**

```
.cardAmount → {fmtFull(metrics.currentValue)}
.cardSub    → 'Modal: {fmtFull(metrics.costBasis)}'
.cardSub    → '{gain>=0?'+':''}{fmtFull(unrealizedGain)}'   /* hanya bila gain ≠ 0;
                                                                 color #22C55E / #EF4444 */
```

**Tidak ada progress bar** di kartu investasi.

**Empat tombol aksi** (urutan kiri ke kanan):

| # | Class | Label | Syarat | Aksi |
|---|---|---|---|---|
| 1 | `.actionBtn.actionBtnBuy` | `Beli` | selalu | `BuyModal` |
| 2 | `.actionBtn.actionBtnSell` | `Jual` | `totalUnits > 0` | `SellModal` |
| 3 | `.actionBtn` (netral) | `Nilai` | `!isDeposito` | `UpdateValueModal` |
| 4 | `.actionBtn` (netral) | `<NavIcon name="edit" size={12}/>` | selalu | `InvestmentFormModal` mode edit |

> Tombol `Nilai` disembunyikan untuk deposito karena nilainya auto-accrued
> (`calcDepositoCurrentValue`) — artinya **deposito tidak bisa di-refresh manual**.
> Lihat Part 8.24.

### 6.8.8 Disclosure: Riwayat Transaksi

**Hanya** bila `sortedTxs.length > 0` (`sortTransactionsByDate` → `date` **descending**).

**Toggle:** `showHistory ? '▲ Sembunyikan' : '▼ Riwayat transaksi'` + ` ({n})`
**Judul panel** (`.txHistoryTitle`): **`Riwayat Transaksi`**
Panel `.txHistory` = `margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-2)`

Tiap baris (`.txItem`, flex `space-between`, `padding: 6px 0`, 12px `var(--text-3)`):
`.txItemDate` (`var(--text-4)`, `min-width: 80px`) `fmtDate(tx.date)` ·
`{tx.type === 'buy' ? 'Beli' : 'Jual'} {tx.units} unit`
(**inline color** `#16A34A` / `#DC2626`) · `.txItemAmount` (600 `var(--text-2)`)
`fmtFull(tx.totalAmount)`

### 6.8.9 `InvestmentFormModal`

`<Modal title={initial ? 'Edit Investasi' : 'Tambah Investasi'} width={520}>`

`hasTransactions = initial?.transactions?.length > 0` → **hanya** mengunci
`<select> Jenis Aset` (dan itu satu-satunya yang dikunci guard ini).

| # | Label | Kontrol | Placeholder | Syarat |
|---|---|---|---|---|
| 1 | `Nama Investasi` | `Input type="text"` | `cth. BCA Deposito, BBCA, Bitcoin` | selalu |
| 2 | `Jenis Aset` | `Select` 8 opsi | — | selalu, **`disabled={hasTransactions}`** |
| 3 | `Bunga per Tahun (%)` | `Input type="number"` | `5` | `deposito` |
| 4 | `Tanggal Jatuh Tempo` | `Input type="date"` | — | `deposito` |
| 5 | `Nama Bank` | `Input type="text"` | `cth. BCA, BNI` | `deposito` |
| 6 | `Kode Saham` | `Input type="text"` | `cth. BBCA, TLKM` | `saham` |
| 7 | `Nama Koin` | `Input type="text"` | `cth. Bitcoin, Ethereum` | `crypto` |
| 8 | `Nama Reksa Dana` | `Input type="text"` | `cth. Schroder Dana Istimewa` | `reksadana` |
| 9 | `Manajer Investasi` | `Input type="text"` | `cth. Schroder Investment` | `reksadana` |
| 10 | `Catatan (opsional)` | `Input type="text"` | `Catatan tambahan` | selalu |

Field 3+4 dalam `.formGrid`. Default `assetType = 'saham'`.

> `emas`, `obligasi`, `p2p`, `lainnya` **tidak punya field khas sama sekali** —
> memilihnya hanya menampilkan field dasar. Untuk `emas`, `result.unit = 'gram'`
> diset tanpa input apa pun.

**Validasi — routing substring** dari `validateInvestment(data)`:

| Pesan | Cek | Field |
|---|---|---|
| `Nama investasi wajib diisi` | `error.includes('Nama')` | `name` |
| `Jenis aset tidak valid` | `error.includes('aset')` | `assetType` |
| `Bunga tidak boleh negatif` | → jatuh ke `else` | `_general` ⚠️ |
| fallback | | `_general` |

> ⚠️ `Bunga tidak boleh negatif` jatuh ke banner general di bawah modal, **bukan** di
> sebelah input `Bunga per Tahun (%)` yang dirujuknya. Lihat Part 8.22.

**Payload per tipe:**

| Tipe | Field tambahan |
|---|---|
| `deposito` | `interestRate: Number \|\| 0`, `maturityDate`, `bankName: trim()` |
| `saham` | `tickerSymbol: trim().toUpperCase()` |
| `crypto` | `coinName: trim()` |
| `emas` | `unit: 'gram'` |
| `reksadana` | `fundName: trim()`, `managerName: trim()` |
| `obligasi` / `p2p` / `lainnya` | — |

Base: `name: trim()`, `assetType`, `notes: trim()`.

> ⚠️ Bila `assetType` diubah saat edit, field tipe lama **tidak di-clear** — hanya
> absen dari payload.

**Tombol:** `.saveBtn` (`Simpan Perubahan` / `Tambah`), `.deleteBtn`
(`Hapus` → `Yakin hapus?`) — identik dengan DebtFormModal.

### 6.8.10 `BuyModal`

`<Modal title={`Beli — ${investment.name}`} width={460}>`
`isDeposito = assetType === 'deposito'`

| # | Label | Kontrol | Placeholder | Catatan |
|---|---|---|---|---|
| 1 | `Jumlah Deposito` (deposito) / `Unit` | `Input type="number"` | `1` (deposito) / `0` | **`disabled={isDeposito}`** |
| 2 | `Nominal (Rp)` (deposito) / `Harga per Unit (Rp)` | `Input type="number"` | `0` | — |
| 3 | `Dompet` | `Select` | — | — |
| 4 | `Tanggal` | `Input type="date"` | — | — |
| 5 | `Catatan (opsional)` | `Input type="text"` | `Catatan pembelian` | — |

Field 1–4 dalam `.formGrid`. Default: `units = isDeposito ? '1' : ''`,
`pricePerUnit: ''`, `walletId = wallets[0]?.id || ''`, `date = TODAY` (module-scope UTC),
`note: ''`.

**Preview total** — **conditional** `totalAmount > 0` (`.previewBox`):
`padding: 12px 16px`, `background: rgba(79,110,247,0.08)`, radius 10,
`border: 1px solid rgba(79,110,247,0.2)`, `margin-bottom: 16px`, 12px `var(--text-2)`
```
Total: {fmtFull(units * pricePerUnit)}
```

**Validasi** (`validateInvestmentTransaction(data, 'buy')`), substring-routed:

| Pesan | Cek | Field |
|---|---|---|
| `Unit harus lebih dari 0` | `includes('Unit')` | `units` |
| `Harga per unit harus lebih dari 0` | `includes('Harga')` | `pricePerUnit` |
| `Dompet wajib dipilih` | `includes('Dompet')` | `walletId` |
| fallback | | `_general` |

**Submit:** `.saveBtn` — **`Konfirmasi Beli`**

Efek samping (`buildInvestmentTransaction`): `type: 'expense'`, `categoryId: 'c13'`
(Hasil: `// Investasi`), `note: `Beli ${investment.name}``,
`tags: ['investasi']`. Parent menimpa `note`/`date` — jadi `Catatan` yang diketik user
**tidak** yang sampai ke transaksi dompet. Lihat Part 8.8.

### 6.8.11 `SellModal`

`<Modal title={`Jual — ${investment.name}`} width={460}>`
`maxUnits = computeTotalUnits(investment.transactions || [])`

**Preambel** (12px `var(--text-4)`, mb 12):
```
Unit yang dimiliki: {maxUnits}
```

| # | Label | Kontrol | Placeholder |
|---|---|---|---|
| 1 | `Unit Jual` | `Input type="number"` | `Max {maxUnits}` (dinamis) |
| 2 | `Harga per Unit (Rp)` | `Input type="number"` | `0` |
| 3 | `Dompet` | `Select` | — |
| 4 | `Tanggal` | `Input type="date"` | — |
| 5 | `Catatan (opsional)` | `Input type="text"` | `Catatan penjualan` |

Field 1–4 dalam `.formGrid`. Preview total memakai `.previewBox` yang sama.

**Validasi:** routing sama seperti BuyModal, plus pesan sell-specific dari
`validateInvestmentTransaction(data, 'sell', maxUnits)`:
`Unit jual melebihi unit yang dimiliki (max: {maxUnits})` — mengandung `'Unit'`, jadi
routing ke `errors.units` ✅.

**Submit:** `.saveBtn` — **`Konfirmasi Jual`**
Efek: `type: 'income'`, `categoryId: 'c17'` (`// Hasil Investasi`),
`note: `Jual ${investment.name}``, `tags: ['investasi']`.

### 6.8.12 `UpdateValueModal`

`<Modal title={`Update Nilai — ${investment.name}`} width={400}>` — modal terkecil di app.

State lokal: `value = String(investment.currentValue || 0)`, `error = ''`
(**string tunggal**, bukan objek `errors` seperti modal lain).

**Preambel** (12px `var(--text-4)`, mb 12):
```
Nilai saat ini: {fmtFull(investment.currentValue || 0)}
```

| Field | Label | Kontrol | Placeholder |
|---|---|---|---|
| 1 | `Nilai Terkini (Rp)` | `Input type="number"` | `0` |

**Validasi:** `validateCurrentValue(numValue)` → `Nilai harus 0 atau lebih`,
dirender lewat `Field error={error}` (jadi warna **`#EF4444`**, bukan `#DC2626` banner).

> ⚠️ Input kosong → `Number('') === 0` → **valid**, diam-diam menulis 0.

**Submit:** `.saveBtn` — **`Simpan`**. Tanpa tombol batal, tanpa preview, tanpa total.

### 6.8.13 Responsive

**Dua** media query — halaman satu-satunya di app dengan 2 breakpoint.

*`≤768px`:*

| Selektor | Perubahan |
|---|---|
| `.summaryGrid` | `repeat(4,1fr)` → **`repeat(2, 1fr)`** |
| `.summaryCard` | `border-radius: 16px; padding: 16px` |
| `.summaryValue` | 18px/700 → **20px/800** |
| `.formGrid` | → 1 kolom |
| `.cardRow` | `flex-wrap: wrap` |
| `.cardRight` | `width: 100%; justify-content: flex-end; margin-top: 8px` |
| `.card` | `border-radius: 16px; padding: 14px 16px` |
| `.actions` | **`flex-wrap: wrap`** (Debt tidak wrap) |
| `.filterBtn` | 13px/500 → 12px/600 |
| `.filterBtnActive` | filled accent |

*`≤480px`:*

| Selektor | Perubahan |
|---|---|
| `.summaryGrid` | `repeat(2, 1fr)` → **`1fr`** |

> Blok 480px **hanya** berisi `.summaryGrid`. 9 chip filter dan 3–4 tombol aksi
> tidak punya aturan tambahan — semuanya mengandalkan `flex-wrap` pada `.filters`
> dan `.actions`.

---

## 6.9 Kesehatan Keuangan

`src/pages/Asset/AssetPage.jsx` (427) + `AssetPage.module.css` (485)
+ `FixedAssetFormModal.jsx` (204).

> **Halaman ini berbeda** dari halaman CRUD lain: ia adalah **dashboard kesehatan
> keuangan**, bukan daftar CRUD. Satu-satunya halaman yang membungkus seluruh konten
> dalam `.wrapper`:
> ```css
> .wrapper { display: flex; flex-direction: column; gap: 20px; max-width: 100%; min-width: 0; }
> ```

### 6.9.1 Header — Tanpa Tombol Aksi

```css
.pageHeader { display: flex; align-items: center; justify-content: space-between;
              margin-bottom: 4px; }   /* bukan 24px */
.pageTitle  { font-size: 24px; font-weight: 700; color: var(--text-1);
              flex: 1; text-align: center; }
.pageSubtitle { font-size: 13px; color: var(--text-5); }
```

| Elemen | String |
|---|---|
| `<h1>` | `Kesehatan Keuangan` |
| Subtitle | `Ringkasan aset, kewajiban, dan rasio keuanganmu` |

Karena `.pageTitle` `flex: 1; text-align: center` **tanpa** saudara kanan, judul
tampak terpusat di lebar penuh. **CTA satu-satunya ada di dalam card `🏠 Aset Tetap`.**

### 6.9.2 Urutan

1. `.pageHeader`
2. `.scoreHero` — gauge kesehatan + grade + bar
3. `.card` **`Net Worth`** → `.netWorthGrid` (3 item)
4. `.breakdownGrid` (2 kolom) → `Komposisi Aset` (4 baris) + `Komposisi Kewajiban` (2 baris)
5. `.card` **`🏠 Aset Tetap`** → `.cardTitleRow` + daftar / teks kosong
6. `.card` **`Rasio Keuangan`** → 5 `.ratioRow`
7. `.card` **`Rekomendasi`** → `.rekomList`
8. `FixedAssetFormModal`

> ⚠️ Urutan ini **berbeda** dari urutan DOM yang terlihat di sumber: `Rekomendasi` adalah
> card **terakhir**, bukan dekat score.

```css
.card      { background: var(--bg-card); border-radius: 16px; padding: 20px;
              border: 1px solid var(--border-2);
              transition: background .2s, border-color .2s;
              animation: fadeInUp .3s ease-out; }
.cardTitle { font-size: 14px; font-weight: 700; color: var(--text-1); margin: 0 0 16px; }
```

### 6.9.3 Health Score Hero

```css
.scoreHero { background: var(--bg-card); border-radius: 18px; padding: 28px 32px;
             border: 1px solid var(--border-2);
             display: flex; align-items: center; gap: 28px;
             animation: fadeInUp .3s ease-out; }
.scoreCircle { position: relative; width: 100px; height: 100px;
               display: flex; align-items: center; justify-content: center;
               flex-shrink: 0; }
.scoreNumber { font-size: 32px; font-weight: 800; letter-spacing: -.02em;
               color: var(--text-1); position: absolute; }
.scoreInfo  { flex: 1; }
.scoreGrade { display: inline-flex; align-items: center; gap: 6px;
              font-size: 16px; font-weight: 700; margin-bottom: 6px;
              padding: 4px 12px; border-radius: 8px;
              /* bg: grade.color + '18' (~9% alpha), color: grade.color */ }
.scoreLabel { font-size: 13px; color: var(--text-4); line-height: 1.5; }
.scoreBar   { margin-top: 12px; height: 8px; background: var(--bg-3);
              border-radius: 99px; overflow: hidden; }
.scoreBarFill { height: 100%; border-radius: 99px;
                transition: width .8s ease-out;
                width: {overallScore}%; background: grade.color; }
```

**Gauge — SVG buatan sendiri**, `viewBox="0 0 100 100"`:

```
track : <circle cx=50 cy=50 r=42 fill=none stroke="var(--bg-3)" strokeWidth=8 />
arc   : <circle cx=50 cy=50 r=42 fill=none stroke={grade.color}
               strokeLinecap="round"
               strokeDasharray={`${(overallScore/100)*264} 264`}
               transform="rotate(-90 50 50)"
               style="transition: stroke-dasharray 0.8s ease-out" />
```

Keliling `2πr ≈ 264`. `rotate(-90)` puts the arc start at 12 o'clock.
Tengah: `.scoreNumber` = `{overallScore}`.

**Teks `.scoreLabel`:**
```
Skor dihitung dari rasio utang, dana darurat, tingkat tabungan, cicilan,
dan porsi investasi.
```

**Grade ladder** (`assetHelpers.js`):

| Skor | Emoji | `grade.label` | `grade.color` |
|---|---|---|---|
| `>= 80` | `💪` | `Sangat Sehat` | `#22C55E` |
| `>= 60` | `🟢` | `Sehat` | `#22C55E` |
| `>= 40` | `🟡` | `Perlu Perhatian` | `#F59E0B` |
| else | `🔴` | `Bahaya` | `#EF4444` |

**Komposisi skor:** base `50`, lalu:

| Faktor | Kondisi | Poin |
|---|---|---|
| Rasio utang/aset | `< 30%` | `+15` |
| | `30–50%` | `+5` |
| | `> 50%` | `-15` |
| Dana darurat | `>= 6 bulan` | `+20` |
| | `3–6 bulan` | `+10` |
| | `< 3 bulan` | `-10` |
| Beban cicilan | `< 30%` | `+10` |
| | `30–50%` | `0` |
| | `> 50%` | `-15` |
| Tingkat tabungan | `> 20%` | `+15` |
| | `10–20%` | `+5` |
| | `< 0%` | `-15` |
| | else | `-10` |
| Porsi investasi | `> 20%` | `+10` |
| | `< 5%` | `-5` |

Hasil di-clamp `0..100`.

### 6.9.4 `Net Worth`

`.netWorthGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }`

Tiga `.netWorthItem` (centered stack; label di atas, nilai di bawah).

### 6.9.5 `Komposisi Aset` & `Komposisi Kewajiban`

`.breakdownGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }`

| Card | Jumlah baris |
|---|---|
| `Komposisi Aset` | 4 |
| `Komposisi Kewajiban` | 2 |

### 6.9.6 `🏠 Aset Tetap`

```css
.cardTitleRow { display: flex; align-items: center; justify-content: space-between; }
```

Judul: `🏠 Aset Tetap` + tombol **`+ Tambah Aset`**

Daftar aset tetap memakai `.fixedAssetRow` dengan sub-elemen:
`.fixedAssetBadge` · `.fixedAssetName` · `.fixedAssetValue` · `.fixedAssetBuy` ·
`.fixedAssetChange`

**Empty state** memakai **inline style**, bukan class `.emptyState` dari modul — blok
`.emptyState/.emptyIcon/.emptyTitle/.emptyDesc` di `AssetPage.module.css` adalah
**CSS mati** (Part 8.15).

### 6.9.7 `Rasio Keuangan`

Lima `.ratioRow`. Tiap baris berisi label, nilai, deskripsi, dan visual bar/progress
dengan ambang warna.

**Mobile:** `.ratioRow` → `flex-wrap: wrap` (badge turun ke baris kedua).

### 6.9.8 `Rekomendasi`

`.rekomList` berisi `.rekomItem` (ikon + `.rekomIcon` + teks `.rekomText`).

> ⚠️ **String rekomendasi tidak berasal dari `assetHelpers.js`** — `assetHelpers.js` hanya
> mengembalikan angka + `grade`. Teks rekomendasi di-hardcode di `AssetPage.jsx:97–131`.

Branch `Investment Ratio` memakai `type: 'perhatian'` (bukan `bahaya`) dengan ikon
`📈` di **kedua** cabangnya.

### 6.9.9 `FixedAssetFormModal`

Judul: `Simpan Perubahan` (edit) / `Tambah Aset` (tambah)

**Submit:** `.saveBtn` full-width, `padding: '12px'`, radius 10, `border: none`,
`background: #4F6EF7`, `#fff`, 14px/600, `marginTop: 4`

**Hapus:** `.deleteBtn` — 2-klik
`{confirmDelete ? 'Yakin hapus aset ini?' : 'Hapus Aset'}`
`width: 100%`, `padding: '10px'`, radius 10,
`background: confirmDelete ? '#EF4444' : 'rgba(220,38,38,0.1)'`,
`color: confirmDelete ? '#fff' : '#F87171'`, `fontSize: 13`, `marginTop: 8`

> **Tidak ada `window.confirm`** — murni 2-klik tanpa reset (tombol tetap
> `Yakin hapus aset ini?` sampai modal ditutup).

**Slot error general** (baris 159–161):
```jsx
{errors._general && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}>{errors._general}</div>}
```

**Validasi** (`src/services/fixedAssetValidator.js`) — **4 pesan, seluruhnya**:

| # | Pemicu | Pesan (verbatim) |
|---|---|---|
| 1 | `!data.name \|\| data.name.trim() === ''` | `Nama aset wajib diisi` |
| 2 | `!data.category` | `Kategori wajib diisi` |
| 3 | `!data.purchasePrice \|\| data.purchasePrice <= 0` | `Harga beli harus lebih dari 0` |
| 4 | `data.currentValue < 0` | `Nilai saat ini tidak boleh negatif` |
| — | selainnya | `null` |

**Routing substring** (baris 55–59):

| Cek | Field tujuan |
|---|---|
| `includes('Nama')` | `name` |
| `includes('Kategori')` | `category` |
| `includes('Harga')` | `purchasePrice` |
| `includes('Nilai')` | `currentValue` |
| else | `_general` |

> ⚠️ Ubah teks validator = routing patah diam-diam. Lihat Part 8.21.

**Payload:**
```js
{
  name: form.name.trim(),
  category: form.category,
  purchasePrice: Number(form.purchasePrice),
  currentValue: Number(form.currentValue) || Number(form.purchasePrice),
  purchaseDate: form.purchaseDate,
  note: form.note.trim(),
}
```
Bila `currentValue` kosong → **fallback ke `purchasePrice`**.

### 6.9.10 Responsive

**Satu** `@media (max-width: 768px)`. Tidak ada 1180/1023/860/639.

| Selektor | Perubahan |
|---|---|
| `.scoreHero` | `flex-direction: column; text-align: center; padding: 28px 32px` → `24px 20px`; radius 18 → **20px** |
| `.scoreCircle` | 100×100 → **90×90** |
| `.scoreNumber` | 32px → **28px** |
| `.netWorthGrid` | `repeat(3, 1fr)` → **1 kolom**, gap 14 → 10 |
| `.netWorthItem` | centered stack → **`flex row; space-between; left-aligned`**, `padding: 14px 8px` → `12px 16px` |
| `.netWorthLabel` | `margin-bottom: 6px` → `0` |
| `.breakdownGrid` | `1fr 1fr` → **1 kolom** |
| `.card` | `padding: 20px` → `16px` |
| `.ratioRow` | → **`flex-wrap: wrap`** (badge turun baris) |

**Tidak ada media rule sama sekali untuk:**
`.cardTitleRow` / `.addAssetBtn` (tombol `+ Tambah Aset` tidak menyusut/bergerak) ·
`.fixedAssetRow` dan semua turunannya · `.rekomList` / `.rekomItem` / `.rekomIcon` /
`.rekomText` · semua `.badge*` · `.pageTitle` (**tetap 24px**, berbeda dari
TransactionsPage yang 18px).

**Class CSS mati di modul ini:** `.emptyState`, `.emptyIcon`, `.emptyTitle`,
`.emptyDesc` (lines 318–343) — tidak pernah dirujuk.
`@keyframes fadeInUp` dipakai oleh `.scoreHero` dan `.card`.

---

## 6.10 Laporan

`src/pages/Reports/ReportsPage.jsx` (523) + `ReportsPage.module.css` (362)
+ `CycleSettingModal.jsx` (91).

### 6.10.1 Header

```css
.pageHeader { display: flex; justify-content: space-between;
              align-items: center; margin-bottom: 24px; }
.pageTitle  { font-size: 24px; font-weight: 700; color: var(--text-1); }
.periodLabel{ font-size: 13px; color: var(--text-5); }
```

| Elemen | Isi |
|---|---|
| `<h1>` | `Laporan` |
| Subtitle | `{range.label}` |
| Tombol 1 | **`Siklus: tgl {cycleStart}`** — `.cycleBtn`, SVG jam inline 14×14 |
| Kontrol 2 | `Select` periode (`width: auto`) |

**Label `range.label`** (`getPeriodRange`):

| Kondisi | Format | Contoh |
|---|---|---|
| `cycleStart <= 1` | `toLocaleDateString('id-ID',{month:'long',year:'numeric'})` | `September 2026` |
| `cycleStart > 1` | `{day:'numeric', month:'short'} – {day:'numeric', month:'short', year:'numeric'}` | `25 Agu – 24 Sep 2026` |

Pemisah **en dash dengan spasi** (U+2013).

**Opsi periode:** `t.date.slice(0,7)` unik dari transaksi + `monthKey(new Date())`,
urut descending, label `{month:'long', year:'numeric'}`. Default `allPeriods[0]?.value`.

**Label pembanding:** `prevLabel` = `{month:'long'}` (mis. `Agustus`);
`prevLabelShort` = `{month:'short'}` (mis. `Agu`).

> ⚠️ `ReportsPage` menerima prop `salaryAdjust` dari `App.jsx` tapi **tidak pernah
> mendeklarasikan atau memakainya** — `getPeriodRange(period, cycleStart)` selalu dipanggil
> dengan 2 argumen. Lihat Part 8.25.

### 6.10.2 Urutan Section

| # | Kontainer | Judul (verbatim) | Subjudul |
|---|---|---|---|
| 1 | `.cashGrid` | *(tanpa judul — 3 `CashCard`)* | — |
| 2 | `.chartsGrid > .card` | `Pengeluaran per Kategori` | — |
| 3 | `.chartsGrid > .card` | `Pemasukan vs Pengeluaran` | — |
| 4 | `.card.dailyCard` | `Pengeluaran Harian` | — |
| 5 | `.card` | `Performa Anggaran` | `per seksi & kategori` (`.perfSubtitle`) |
| 6 | `.card` *(conditional)* | `📦 Biaya Berkala (Amortized)` | `biaya bulanan sebenarnya dari item berkala` |

Section 6 hanya tampil bila `recurringItems.length > 0`, dengan inline
`style={{ marginTop: 24 }}`.

### 6.10.3 Tiga `CashCard`

Komponen lokal (`ReportsPage.jsx:504–523`), props
`{ label, value, color, icon, sub, subColor }`.

```css
.cashGrid  { display: grid; grid-template-columns: repeat(3, 1fr);
             gap: 14px; margin-bottom: 20px; }
.cashCard  { background: var(--bg-card); border-radius: 16px; padding: 18px 20px;
             border: 1px solid var(--border-2); }
.cashCardHeader { display: flex; justify-content: space-between; align-items: center;
                  margin-bottom: 10px; }
.cashCardLabel  { font-size: 11px; font-weight: 600; color: var(--text-5);
                  text-transform: uppercase; letter-spacing: .04em; }
.cashCardIcon   { opacity: .7 }
.cashCardValue  { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.cashCardSub    { font-size: 12px; font-weight: 600; margin-top: 4px; }
```

| # | Label | Nilai | Warna nilai | Ikon | Sub |
|---|---|---|---|---|---|
| 1 | `Total Pemasukan` | `income` | `#22C55E` | `income` (TrendingUp) | — |
| 2 | `Total Pengeluaran` | `expense` | `#EF4444` | `expense` (TrendingDown) | `{±expDelta}% vs {prevLabelShort}` |
| 3 | `Net Cashflow` | `income - expense` | `>=0 ? #4F6EF7 : #EF4444` | `income` / `expense` | — |

`expDelta = prevExp > 0 ? ((expense - prevExp) / prevExp * 100).toFixed(1) : 0`
(fallback adalah **angka** `0`, jadi tampil `0%` bukan `NaN%`).
`subColor = expDelta > 0 ? '#EF4444' : '#22C55E'` — **pengeluaran naik = merah**.

### 6.10.4 `Pengeluaran per Kategori`

**Chart: `PieChart`** (Part 4.11.1), `size={180}`, data `topCats.map(...)` →
`{ label: cat.name, value: amt, color: cat.color }`, dibungkus `.pieChartWrap`.

**Legend — `.legendRow`, maks 6 teratas:**

```css
.legendLeft  { display: flex; align-items: center; gap: 8px; }
.legendDot   { width: 10px; height: 10px; border-radius: 3px; }
.legendName  { font-size: 13px; color: var(--text-2); }
.legendAmount{ font-size: 13px; font-weight: 700; }
.legendPct   { font-size: 11px; color: var(--text-5); margin-left: 8px; }
```

`legendPct` = `{pct}%`, `pct = expense > 0 ? Math.round(amt / expense * 100) : 0`.

**Empty state:** `Tidak ada data` (`.emptyState`: `text-align:center; padding:24px 0;
color: var(--text-6)`, 13px) — tampil bila `topCats.length === 0`.

### 6.10.5 `Pemasukan vs Pengeluaran`

**Chart 1: `CompareBarChart`** (Part 4.11.2)

| Bar | `label` | `value` | `color` |
|---|---|---|---|
| 1 | `Pemasukan` | `income` | `#22C55E` |
| 2 | `Pengeluaran` | `expense` | `#EF4444` |
| 3 | `{prevLabelShort}` | `prevExp` | `var(--text-6)` (dirender `fillOpacity 0.45`) |

**Chart 2: `MonthCompareBar`** (Part 4.11.3), `marginTop: 20`, didahului `.compareLabel`:

```
Pengeluaran bulan ini vs {prevLabel}
```

`current = expense` (merah `#EF4444`), `prev = prevExp` (`#FCA5A5`),
`curLabel = "Bln Ini"`, `prevLabel = prevLabelShort`.

### 6.10.6 `Pengeluaran Harian`

**Chart: `DailyBarChart`** (Part 4.11.4) — `data={dailyExp}`, `max={maxDaily}`,
`days={rangeDays}`, `cycleStart`.

Legenda (hanya bila `cycleStart > 1`, 11px `var(--text-5)`):
```
│ = hari mulai siklus (tgl {cycleStart})
```

### 6.10.7 `Performa Anggaran`

Judul: **`Performa Anggaran`** + subjudul **`per seksi & kategori`** (`.perfSubtitle`)

Tiga `.sectionBlock` (`margin-bottom: 24px`), iterasi `['needs','wants','savings']`.

**Header section** (`.sectionHeader`, `background: sectionColor(sec) + '12'`, radius 8,
`padding: 8px 12px`):

```
[● 10px radius 3 sectionColor] {sectionName} [⚠ Melebihi!]      {fmtFull(spent)} / {fmtFull(total)} {pct}%
```

| Elemen | Isi | Warna |
|---|---|---|
| `.sectionName` | `sectionLabel(sec)` — 14px/700 | — |
| `.sectionOverflow` | `Melebihi!` + `<NavIcon name="warning" size={12}/>` — 11px/700 | `#EF4444` |
| nilai spent | `fmtFull(spent)` | `#EF4444` bila over, else `var(--text-1)` |
| `.sectionSep` | `" / "` | `var(--text-6)` |
| `.sectionAllocated` | `fmtFull(secData.total)` | `var(--text-4)` |
| `{pct}%` | `margin-left: 8px` | `#EF4444` bila over · `#F59E0B` bila `pct > 80` · else `#22C55E` |

`<ProgressBar value={spent} max={total} color={sectionColor(sec)} height={6} showOverflow />`
dibungkus `.sectionProgressWrap` (`padding-left: 8px`).

**Baris kategori** (`.catList`, `padding-left: 20px`, gap 8) — deklaratiff,
**bukan `<table>`**:

```
[● 7px radius 2 catColor] {cat?.name || c.id} [OVER]     {fmt(cSpent)} / {fmt(c.amt)}  {cPct}%
<ProgressBar value={cSpent} max={c.amt} color={cat?.color || sectionColor(sec)}
             height={5} showOverflow />
```

| Elemen | Isi | Warna |
|---|---|---|
| `.catName` | `cat?.name \|\| c.id` — 12.5px `var(--text-3)` | — |
| `.catOverBadge` | `OVER` — 10px/700, radius 4 | `#F87171` pada `rgba(220,38,38,0.1)` |
| `.catAmounts` | `{fmt(cSpent)}` + `.catSep " / "` + `{fmt(c.amt)}` — 12px `var(--text-4)` | — |
| `{cPct}%` | 11px/700, `min-width 32`, rata kanan | `#EF4444` bila over · `#F59E0B` bila `>80` · else `#22C55E` |

> **Perhatikan inkonsistensi format:** header section memakai `fmtFull` (penuh),
> baris kategori memakai `fmt` (singkat).

**Empty per section:** `Belum ada kategori` (`.catEmpty`, 12px `var(--text-6)`,
`padding-top: 4px`) — tampil bila `secData.cats.length === 0`.

### 6.10.8 `📦 Biaya Berkala (Amortized)`

**Conditional** `recurringItems.length > 0`.

**1. Grid per section** (inline `gridTemplateColumns: 'repeat(3, 1fr)'`, gap 12,
`margin: '16px 0'`), tiap tile: `padding: '12px 16px'`,
`background: sectionColor(sec) + '10'`, radius 10, `border: 1px solid ${sectionColor(sec)}30`:
label `sectionLabel(sec)` (11px/600 uppercase `var(--text-4)`) + nilai
`fmtFull(Math.round(val))` (16px/700 `sectionColor(sec)`) + satuan **`/bulan`** (11px `var(--text-4)`)

**2. Baris total** (`background: var(--bg-3)`, radius 10, `padding: '12px 16px'`, mb 16):
**`Total Biaya Berkala/Bulan`** (13px/600 `var(--text-2)`) +
`fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))` (16px/700 `#4F6EF7`)

**3. Breakdown per kategori** — judul **`Breakdown per Kategori`**
(12px/600 uppercase `var(--text-4)`, mb 8)

Tiap baris (flex `space-between`, `padding: '8px 0'`, border-bottom):
dot 8px warna item + `item.categoryName` (13px `var(--text-2)`) →
**`{fmtFull(Math.round(item.monthlyCost))}/bln`** (13px/600)

Sumber `getAmortizedByCategory`, sudah terurut `monthlyCost` **descending**.
Fallback nama kategori: **`Lainnya`** dengan warna `#94A3B8`.

### 6.10.9 Blok `💡 Perbandingan`

`marginTop: 16`, `padding: '12px 16px'`, `background: rgba(79,110,247,0.08)`,
radius 10, `border: 1px solid rgba(79,110,247,0.2)`

Judul: **`💡 Perbandingan`** (12px/600 `var(--text-2)`)

Isi (12px `var(--text-3)`, line-height 1.5), tiga baris:
```
Pengeluaran aktual bulan ini: {fmtFull(expense)}
Biaya berkala (amortized): {fmtFull(Math.round(getTotalAmortizedCost(recurringItems)))}
True monthly cost (aktual + amortized berkala yang belum beli bulan ini): {…}
```

Nilai baris 3 = `expense + getTotalAmortizedCost(...) − Σ(amount item aktif yang
lastPurchaseDate-nya mulai dengan periode terpilih)`.

> ⚠️ **Bug formatting:** `<br />` **hilang** antara baris 2 dan 3 — keduanya render di
> satu baris. Lihat Part 8.26.
> ⚠️ Baris 3 adalah **satu-satunya string campuran Inggris–Indonesia** di seluruh
> file ini.

### 6.10.10 State

| Jenis | String | Kondisi | Kontainer |
|---|---|---|---|
| Empty (kategori) | `Tidak ada data` | `topCats.length === 0` | `.emptyState` |
| Empty (donut) | `Tidak ada data` | `total === 0` | di dalam `PieChart` |
| Empty (per section) | `Belum ada kategori` | `secData.cats.length === 0` | `.catEmpty` |

**Tidak ada** empty state tingkat halaman — kartu cashflow, chart harian, dan kartu
amortisasi dirender tanpa syarat dengan nilai nol.

### 6.10.11 `CycleSettingModal`

`<Modal title="Atur Siklus Pembayaran" width={420}>`

**Paragraf** (13px `var(--text-4)`, lineHeight 1.6):
```
Tentukan tanggal mulai siklus bulanan Anda. Misalnya jika gaji masuk tanggal 25,
periode laporan akan dihitung dari tgl 25 bulan lalu hingga tgl 24 bulan berjalan.
```

**Field `Tanggal Mulai Siklus`** — **bukan `Input`**, melainkan 11 chip hari
(`.dayBtn` 44×44, radius 9, `border: 1.5px solid`; terpilih `borderColor: '#4F6EF7'`,
`background: var(--bg-3)`, `color: '#4F6EF7'`, `fontWeight: 700`; tidak terpilih
`var(--border)` / `var(--bg-card)` / `var(--text-3)` / 400). Teks chip = angka mentah.

```js
const dayOptions = [1, 5, 10, 15, 20, 23, 24, 25, 26, 27, 28];
```

**Helper di bawah chip** (11px `var(--text-5)`, mt 10):

| Kondisi | Teks |
|---|---|
| `day <= 1` | `Siklus standar: 1 – akhir bulan` |
| else | `Siklus: tgl {day} bulan lalu – tgl {day-1} bulan berjalan` |

**Submit:** **`Simpan`** — full-width, `padding: '9px 16px'`, radius 8,
`background: #4F6EF7`, `color: white`, `fontSize: 13.5`, `fontWeight: 600`.
**Tanpa tombol batal.**

> **Tidak ada validasi** — semua 11 chip bisa disimpan, `day` tidak di-range-check.

> **Perbedaan dari `PeriodModal`:** chip hari di sini **11** opsi
> (`[1,5,10,15,20,23,24,25,26,27,28]`) dan **tidak ada** dukungan "sesuaikan hari libur".
> Bandingkan Part 6.4.12 yang punya **13** opsi (`DAY_OPTIONS`) + blok penyesuaian gaji.

### 6.10.12 Responsive

**Satu** `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.cashGrid` | `repeat(3, 1fr)` → **1 kolom** (3 CashCard stack) |
| `.chartsGrid` | `1fr 1fr` → **1 kolom** (pie, lalu bar) |
| `.pageHeader` | `flex-direction: column; align-items: flex-start; gap: 12px` |
| `.pageTitle` | 24px → **18px** |
| `.cashCardValue` | 22px → **20px** |
| `.card` | `padding: 20px` → `16px` |
| `.cashCard` | `padding: 18px 20px` → `16px` |
| `.pieChartWrap` | → `max-width: 160px; margin: 0 auto` (pusat + kecilkan donut) |
| `.cycleBtn` | → **pill**: radius **20px**, `padding: 9px 18px`, 12px |

**Tidak di-collapse (gap nyata):**
- Grid 3 kolom kartu amortisasi memakai **inline** `gridTemplateColumns: 'repeat(3, 1fr)'`
  — media query tidak bisa menjangkaunya, jadi 3 tile tetap side-by-side di mobile
- `.headerActions` tanpa aturan mobile — tombol `Siklus: tgl N` + `Select` tetap sebaris
- `.catList` `padding-left: 20px` dan ukuran font `.sectionRight` tetap
- `.dailyCard` tanpa aturan mobile; `DailyBarChart` menanganinya sendiri via `overflow-x: auto`

---

## 6.11 Kalkulator FIRE

`src/pages/Fire/FirePage.jsx` (477) + `FirePage.module.css` (536).
Helper: `src/utils/fireCalculator.js` (263).

### 6.11.1 Konsep Domain

FIRE = **F**inancial **I**ndependence, **R**etire **E**arly. Menghitungberapa tahun
lagi pengguna mencapai kemandirian finansial, dengan 3 skenario return.

### 6.11.2 Layout & Header

```css
.wrapper { display: flex; flex-direction: column; gap: 16px;
           max-width: 900px; margin: 0 auto; }
.pageHeader { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.backBtn    { width: 36px; height: 36px; border-radius: 10px;
              border: 1px solid var(--border); background: var(--bg-card);
              color: var(--text-3); }   /* chevron-left SVG 16px */
.pageTitle  { font-size: 20px; font-weight: 700; color: var(--text-1); }
```

| Elemen | Isi |
|---|---|
| `backBtn` | Chevron kiri, `aria-label="Kembali"`, `onClick={() => setPage('dashboard')}` — **tanpa label teks** |
| `<h1>` | `Kalkulator FIRE 🔥` (emoji U+1F525) |

> **Layout kolom tunggal**, bukan 2 kolom. Grid 2 kolom hanya muncul **di dalam** card
> (`.projCardsRow` dan `.inputGrid`).

**Urutan card:**

| # | Card | Judul |
|---|---|---|
| 1 | `.card.scoreCard` | *(tanpa judul — score hero)* |
| 2 | `.projCardsRow` (2× `.projCard`) | *(tanpa judul)* |
| 3 | `.card` | `Data Finansial` |
| 4 | `.card` | `Alokasi Pendapatan` |
| 5 | `.card` | `Asumsi Pasar` |
| 6 | `.card` | `Proyeksi Pertumbuhan Portofolio` |
| 7 | `.card` | *(tanpa judul — tabs)* |

### 6.11.3 `FI Readiness Score`

```css
.scoreValue { font-size: 48px; font-weight: 800; letter-spacing: -.02em;
              font-variant-numeric: tabular-nums; }
.scoreLabel { font-size: 13px; font-weight: 600; color: var(--text-4); }
.congratsMsg{ font-size: 14px; font-weight: 600; color: #16A34A; margin-top: 12px; }
```

- Nilai: `{fiScore.toFixed(1)}%`
- Label: **`FI Readiness Score`**
- `<ProgressBar value={fiScore} max={100} color={scoreColor} height={10} />`
- **Conditional** `fiScore >= 100` → `.congratsMsg`:
  **`🎉 Selamat! Anda telah mencapai Financial Independence!`**

`fiScore = fireNumber <= 0 ? 0 : Math.min(100, (currentAssets / fireNumber) * 100)`

**Ambang `scoreColor`:** `< 25 → #EF4444` · `< 50 → #F59E0B` · `< 75 → #EAB308` ·
else `#22C55E`

### 6.11.4 Dua Kartu FIRE Number

```css
.projCardsRow { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.projCardLabel{ font-size: 11px; font-weight: 600; text-transform: uppercase;
                color: var(--text-5); }
.projCardValue{ font-size: 16px; font-weight: 700; color: var(--text-1);
                word-break: break-all; }
```

| # | Label | Nilai |
|---|---|---|
| 1 | `FIRE Number (Saat Ini)` | `fmtFull(baseFireNumber)` — **tidak** dibulatkan |
| 2 | `FIRE Number (Pensiun)` | `fmtFull(Math.round(inflationAdjustedFire))` |

`baseFireNumber = monthlyExpenses × 12 × 25` (aturan 4%, ×25)
`inflationAdjustedFire = yearsToRetirement <= 0 ? baseFireNumber
                        : baseFireNumber × (1 + inflation/100) ** yearsToRetirement`

### 6.11.5 Card `Data Finansial`

```css
.inputGrid   { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.inputGroup  { display: flex; flex-direction: column; gap: 4px; }
.inputLabel  { font-size: 11px; font-weight: 600; text-transform: uppercase;
               letter-spacing: .04em; color: var(--text-5); }
.inputField  { padding: 10px 12px; border-radius: 10px;
               border: 1px solid var(--border); background: var(--bg-2);
               font-size: 14px; font-variant-numeric: tabular-nums; }
.inputField:focus { border-color: #4F6EF7; box-shadow: 0 0 0 3px rgba(79,110,247,.12); }
.inputWithBtn{ display: flex; gap: 6px; }
.autoFillBtn { padding: 0 10px; border-radius: 8px; border: 1px solid var(--border);
               background: var(--bg-2); color: #4F6EF7; font-size: 11px;
               font-weight: 600; white-space: nowrap; }
.autoFillBtn:hover { background: rgba(79,110,247,.08); }
.validationError   { font-size: 11px; color: #EF4444; font-weight: 500; margin-top: 2px; }
.validationWarning { font-size: 11px; color: #F59E0B; font-weight: 500; margin-top: 2px; }
```

Semua field `type="number"`, `onChange = Number(e.target.value) || 0`.

| # | Label | Default | min/max | Tombol `Auto` | Validasi |
|---|---|---|---|---|---|
| 1 | `Usia Saat Ini` | `25` | `min={15} max={80}` | — | `Usia harus 15-80 tahun` |
| 2 | `Target Usia Pensiun` | `45` | — | — | `Target harus lebih dari usia saat ini` |
| 3 | `Pendapatan Bulanan` | `10000000` | — | ✅ `title="Auto-fill dari data transaksi"` (bila `transactions.length > 0`) | `Pendapatan harus lebih dari 0` |
| 4 | `Pengeluaran Bulanan` | `5000000` | — | ✅ `title="Auto-fill dari data transaksi"` | `Pengeluaran tidak boleh negatif` |
| 5 | `Aset FIRE Saat Ini` | `0` | — **`gridColumn: '1 / -1'`** (baris penuh) | ✅ `title="Auto-fill dari portofolio investasi"` (bila `investments.length > 0`) | — |

Field 4 punya **dua** pesan: `Pengeluaran tidak boleh negatif` (error) dan
`Pengeluaran ≥ pendapatan, tidak ada margin tabungan` (**warning**).

**Kondisi validasi:**

| Key | Kondisi | Pesan | Jenis |
|---|---|---|---|
| `currentAge` | `< 15 \|\| > 80` | `Usia harus 15-80 tahun` | error |
| `retirementAge` | `<= currentAge` | `Target harus lebih dari usia saat ini` | error |
| `monthlyIncome` | `<= 0` | `Pendapatan harus lebih dari 0` | error |
| `monthlyExpenses` | `< 0` | `Pengeluaran tidak boleh negatif` | error |
| `expenseWarning` | `>= income && income > 0 && expenses > 0` | `Pengeluaran ≥ pendapatan, tidak ada margin tabungan` | warning |

**Tombol `Auto` — isi label persis `Auto`.**

**Rumus auto-fill:** rata-rata transaksi `income` (resp. `expense`) 3 bulan terakhir,
`Math.round(total / 3)`. Auto-fill investasi = `Σ inv.currentValue` (tanpa pembulatan).

**Auto-save:** debounce **500ms** menulis 10 field lewat `onSaveFireSettings`.

> ⚠️ Dependency array `useEffect` ini memuat `onSaveFireSettings`, sedangkan
> `App.jsx` tidak mememoize callback-nya — timer ter-reset tiap render App. Lihat Part 8.27.

### 6.11.6 Card `Alokasi Pendapatan`

> **Bukan slider** — 4 field `<input type="number">`.

```css
.allocRow    { display: flex; align-items: center; gap: 10px;
               margin-bottom: 12px; flex-wrap: wrap; }
.allocLabel  { font-size: 13px; font-weight: 600; color: var(--text-2);
               width: 80px; flex-shrink: 0; }
.allocInput  { width: 60px; text-align: center; border-radius: 8px; }
.allocPct    { font-size: 13px; color: var(--text-4); }
.allocNominal{ font-size: 12px; color: var(--text-4); flex: 1; text-align: right; }
.allocTotal  { border-top: 1px solid var(--border-2); padding-top: 12px; margin-top: 4px; }
.allocTotalLabel { font-size: 13px; font-weight: 600; color: var(--text-2); }
.allocTotalValue { font-size: 14px; font-weight: 700; }
```

| Urut | Label | Key | Default | min/max | Tampil |
|---|---|---|---|---|---|
| 1 | `Pokok` | `pokok` | `50` | `0`–`100` | `%` + `fmt(round(monthlyIncome × pct/100))` |
| 2 | `Hiburan` | `hiburan` | `20` | `0`–`100` | idem |
| 3 | `FIRE` | `fire` | `25` | `0`–`100` | idem |
| 4 | `Emas` | `emas` | `5` | `0`–`100` | idem |

`handleAllocChange` clamp ke `0..100` dan memetakan `'' → 0`.

**Baris total:** label **`Total`** + `{allocTotal}%` dengan warna:

| Kondisi | Warna |
|---|---|
| `=== 100` | `#22C55E` |
| `> 100` | `#EF4444` |
| `< 100` | `#F59E0B` |

**Validasi alokasi:**

| Kondisi | Pesan | Class |
|---|---|---|
| `allocTotal > 100` | `Total melebihi 100% ({allocTotal - 100}% lebih)` | `.validationError` |
| `allocTotal < 100` | `Sisa {100 - allocTotal}% belum dialokasikan` | `.validationWarning` |

> Pesan pertama terdengar janggal — `(% lebih)` berarti "(% lebih)" dengan delta mentah.

### 6.11.7 Card `Asumsi Pasar` — Empat Slider

```css
.sliderRow    { margin-bottom: 16px; }
.sliderHeader { display: flex; justify-content: space-between; align-items: center; }
.sliderLabel  { font-size: 13px; font-weight: 600; }
.sliderValue  { font-size: 14px; font-weight: 700; color: #4F6EF7; }
.slider       { appearance: none; width: 100%; height: 6px; border-radius: 3px;
                background: var(--bg-3); }
.slider::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px;
                border-radius: 50%; background: #4F6EF7;
                border: 3px solid #fff; box-shadow: 0 2px 6px rgba(79,110,247,.3); }
.sliderRange  { display: flex; justify-content: space-between;
                font-size: 10px; color: var(--text-5); }
```

| # | Label | Nilai | min | max | step | Label `.sliderRange` |
|---|---|---|---|---|---|---|
| 1 | `Return Investasi Pra-Pensiun` | `{returnRate}%` | `1` | `20` | `0.5` | `1%` … `20%` |
| 2 | `Kenaikan Gaji Tahunan` | `{salaryGrowth}%` | `0` | `15` | `0.5` | `0%` … `15%` |
| 3 | `Estimasi Inflasi` | `{inflation}%` | `1` | `12` | `0.5` | `1%` … `12%` |
| 4 | `Return Konservatif Pasca-Pensiun` | `{postRetirementReturn}%` | `1` | `12` | `0.5` | `1%` … `12%` |

Default: `10`, `5`, `4`, `6`.

> Ada aturan `::-moz-range-thumb` tapi **tidak ada** `::-moz-range-track`.

### 6.11.8 Card `Proyeksi Pertumbuhan Portofolio` — Satu-Satunya Recharts

```css
.chartWrapper { width: 100%; height: 300px; }
```

```jsx
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={projectionData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
```

| Elemen | Konfigurasi |
|---|---|
| **Tipe** | `LineChart` (bukan composed/area/bar) |
| **Data** | `generateProjection({...})` |
| **XAxis** | `dataKey="age"`, `tick={{fontSize: 11}}`, `label={{value: 'Usia', position: 'bottom', fontSize: 11}}` |
| **YAxis** | `tick={{fontSize: 10}}`, `tickFormatter={v => fmt(v)}`, `width={50}` |
| **Tooltip** | `formatter` → `fmtFull(value)`; `labelFormatter` → `Usia {label}` |
| **Legend** | `wrapperStyle={{fontSize: 11}}` |
| **ReferenceLine** | `y={inflationAdjustedFire}`, `stroke="#DC2626"`, `strokeDasharray="5 5"`, `label={{value: 'Target', fontSize: 10, fill: '#DC2626'}}` |
| **Line 1** | `type="monotone" dataKey="optimis" name="Optimis" stroke="#22C55E" strokeWidth={2} dot={false}` |
| **Line 2** | `type="monotone" dataKey="moderat" name="Moderat" stroke="#4F6EF7" strokeWidth={2} dot={false}` |
| **Line 3** | `type="monotone" dataKey="pesimis" name="Pesimis" stroke="#F59E0B" strokeWidth={2} dot={false}` |

Semua `dot={false}`, `type="monotone"`. Urutan legend: `Optimis`, `Moderat`, `Pesimis`.

> `ReferenceLine` digambar **setelah** Tooltip/Legend tapi **sebelum** `Line` — jadi
> garis data menutupi garis target.

**`generateProjection`:** `years = retirementAge - currentAge`; `[]` bila `years <= 0`.
Rate: `moderat = returnRate`, `optimis = returnRate + 2`, `pesimis = max(0, returnRate - 2)`.
Menghasilkan `years + 1` baris (`i = 0..years`):
`{ year, age, optimis, moderat, pesimis, target }`.
Pertumbuhan: `val = val × (1 + rate) + annualSavings` dengan
`annualSavings = monthlyIncome × 12 × (fireAllocationPct/100) × (1 + salaryGrowth)^i`.

> Field `target` dihitung tapi **tidak pernah di-plot** — `ReferenceLine` memakai nilai
> `inflationAdjustedFire` yang datar.

### 6.11.9 Tabs Hasil

```css
.tabs    { display: flex; gap: 4px; background: var(--bg-3);
           border-radius: 10px; padding: 4px; }
.tabBtn  { flex: 1; padding: 8px 12px; border-radius: 8px;
           font-size: 13px; font-weight: 600; }
.tabBtnActive { background: var(--bg-card); color: var(--text-1);
                box-shadow: 0 1px 3px rgba(0,0,0,.08); }
```

| Tab | `activeTab` | Panel | Default |
|---|---|---|---|
| `Saran` | `'saran'` | `.recList` rekomendasi | ✅ |
| `Akumulasi` | `'akumulasi'` | tabel 1 | — |
| `Pensiun` | `'pensiun'` | baris pengantar + tabel 2 | — |

#### Tabel 1 — `Akumulasi`

`.tableWrap` (`overflow-x: auto`) → `<table class="table">` (`min-width: 480px`, 12px,
`border-collapse: collapse`; `th` 10px/600 uppercase `var(--text-5)`, `white-space: nowrap`;
`td` `tabular-nums`)

| Kolom | Ekspresi | Warna |
|---|---|---|
| `Tahun` | `row.year` | — |
| `Usia` | `row.age` | — |
| `Tabungan/Thn` | `fmt(round(monthlyIncome × 12 × (allocation.fire/100) × (1 + salaryGrowth/100) ** i))` | — |
| `Portofolio` | `fmt(row.moderat)` | — |
| `Growth` | `i === 0 ? '—' : `${growth.toFixed(0)}%`` | `>= 0 ? #22C55E : #EF4444` |

`growth = i === 0 ? 0 : ((row.moderat - projectionData[0].moderat)
                         / Math.max(1, projectionData[0].moderat) × 100)`
— **persentase kumulatif sejak tahun 0**. Baris pertama menampilkan em dash `—` (U+2014).

#### Tabel 2 — `Pensiun`

**Baris pengantar** (13px `var(--text-3)`, mb 12):
```
Portofolio cukup untuk {retirementData.years} tahun pensiun
```

| Kolom | Ekspresi | Warna |
|---|---|---|
| `Tahun` | `row.year` | — |
| `Usia` | `row.age` | — |
| `Penarikan` | `fmt(row.withdrawal)` | — |
| `Sisa` | `fmt(row.remaining)` | — |
| `Return` | `fmt(row.returnAmount)` | **selalu** `#22C55E` |

Baris: `retirementData.data.slice(0, 30)` — **di-cap keras 30 baris**.

`calcRetirementSustainability`: simulasi sampai `maxYears = 60`, break bila
`remaining <= 0`. Tiap tahun: `returnAmount = round(remaining × returnRate/100)`,
`withdrawal = round(yearlyExpenses)`,
`remaining = max(0, remaining + returnAmount - withdrawal)`, lalu
`yearlyExpenses *= (1 + inflation/100)`.
`portfolioAtRetirement` = nilai **`moderat`** baris proyeksi terakhir.

#### Tab `Saran` — Semua Rekomendasi

`generateRecommendations` → `{ type, text }`, dirender `.recItem` + modifier.
Ikon: `warning → ⚠️` · `success → ✅` · selainnya `ℹ️`.

```css
.recItem          { display: flex; gap: 10px; padding: 12px; border-radius: 10px;
                    font-size: 13px; line-height: 1.5; }
.recItemWarning   { background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.2); }
.recItemSuccess   { background: rgba(34,197,94,.08);  border: 1px solid rgba(34,197,94,.2); }
.recItemInfo      { background: rgba(79,110,247,.08); border: 1px solid rgba(79,110,247,.2); }
.recIcon          { font-size: 16px; }
```

| # | type | Kondisi | Teks (template verbatim) |
|---|---|---|---|
| 1 | `warning` | `savingsRate < 20` | `Alokasi FIRE Anda hanya {savingsRate}%. Tingkatkan ke minimal 20-30% untuk mempercepat perjalanan FIRE.` |
| 2 | `success` | `savingsRate >= 40` | `Alokasi FIRE {savingsRate}% sangat baik! Anda berada di jalur yang tepat.` |
| 3 | `warning` | `expenseRatio > 50` | `Pengeluaran Anda {round(expenseRatio)}% dari pendapatan. Coba kurangi ke bawah 50% untuk meningkatkan tabungan FIRE.` |
| 4 | `success` | `readinessScore >= 100` | `🎉 Selamat! Anda telah mencapai Financial Independence! Portofolio Anda sudah mencukupi.` |
| 5 | `info` | `readinessScore >= 75` | `Anda sudah {readinessScore.toFixed(1)}% menuju FI. Tinggal sedikit lagi!` |
| 6 | `warning` | `readinessScore < 25 && yearsToRetirement < 10` | `Skor FI masih {readinessScore.toFixed(1)}% dengan {yearsToRetirement} tahun menuju pensiun. Pertimbangkan untuk menaikkan target usia atau tingkatkan alokasi.` |
| 7 | `info` | `yearsToRetirement > 25` | `Waktu investasi Anda panjang — manfaatkan compound interest dengan konsisten berinvestasi.` |
| 8 | `warning` | `currentAssets < monthlyExpenses * 6` | `Pastikan Anda sudah memiliki dana darurat minimal 6 bulan pengeluaran sebelum agresif berinvestasi FIRE.` |
| 9 | `info` | `recommendations.length === 0` (fallback) | `Perjalanan FIRE Anda sedang berjalan dengan baik. Tetap konsisten!` |

> ⚠️ Parameter bernama `savingsRate` sebenarnya diisi `allocation.fire` (persentase alokasi
> FIRE). Rekomendasi #7 adalah satu-satunya yang mencampur Inggris ("compound interest").
> Lihat Part 8.28.

### 6.11.10 Responsive

**Satu** `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.wrapper` | `gap: 16px` → `12px` |
| `.card` | `padding: 20px` → `16px` (radius tetap 16) |
| `.projCardsRow` | `1fr 1fr` → **`1fr 1fr` + `gap: 8px`** (sengaja tetap 2 kolom) |
| `.projCard` | `padding: 16px` → `14px` |
| `.projCardValue` | 16px → `14px` |
| `.inputGrid` | `1fr 1fr` → **1 kolom** (field Data Finansial stack) |
| `.scoreValue` | 48px → **40px** |
| `.chartWrapper` | `height: 300px` → `250px` |
| `.tabs` | radius 10 → **20px**, padding 4 → `3px` (jadi pill) |
| `.tabBtn` | `padding 8px 12px` → `8px 8px`, radius 8 → **18px**, 13px → `12px` |
| `.allocRow` | **`flex-wrap: wrap` → `nowrap`** (baris alokasi berhenti wrap) |
| `.allocLabel` | `width: 80px` → `70px`, 13px → `12px` |
| `.allocInput` | `width: 60px` → `50px`, `padding 6px 8px` → `6px 4px`, 14px → `13px` |
| `.allocNominal` | 12px → `11px` |
| `.table` | `min-width: 480px` → `400px` (tetap scrollable via `.tableWrap`) |

**Tidak berubah:** `.pageHeader`, `.backBtn`, `.pageTitle`, `.scoreLabel`, `.congratsMsg`,
`.sliderRow`, `.slider*`, `.autoFillBtn`, `.validation*`, `.tableWrap`, `.recList`,
`.recItem*`. `max-width: 900px` pada `.wrapper` juga tidak dikecilkan.

---

## 6.12 Pengaturan

`src/pages/Settings/SettingsPage.jsx` (957) + `SettingsPage.module.css` (447)
+ `ImportConfirmModal.jsx` (249), `ResetConfirmModal.jsx` (176).

### 6.12.1 Header

```css
.pageHeader { margin-bottom: 24px; }
.pageTitle  { font-size: 22px; font-weight: 800; color: var(--text-1); }
```

| Elemen | Isi |
|---|---|
| `<h1>` | `Pengaturan` |

**Tanpa subtitle dan tanpa tombol aksi di header.**

```css
.sectionCard { background: var(--bg-card); border-radius: 14px; padding: 20px 24px;
               box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04);
               border: 1px solid var(--border-2); }
.sectionTitle{ font-size: 16px; font-weight: 700; color: var(--text-1);
               margin-bottom: 8px; }
.sectionDesc { font-size: 13px; color: var(--text-4); line-height: 1.5;
               margin-bottom: 16px; }
```

### 6.12.2 Urutan Enam Section

| # | Judul | Deskripsi | Syarat |
|---|---|---|---|
| 1 | `Alat Keuangan` | — | `setPage` tersedia |
| 2 | `Ekspor Data` | `Unduh semua data Anda (dompet, transaksi, anggaran, kategori, dan preferensi) sebagai file cadangan.` | selalu |
| 3 | `Impor Cadangan` | `Pulihkan data dari file cadangan BudgetX (JSON atau ZIP).` | selalu |
| 4 | `Impor Data CSV` | `Impor data dari file CSV. Pilih file yang ingin Anda impor (minimal 1).` | selalu |
| 5 | `Kelola Kategori` | `Atur kategori pengeluaran dan pemasukan Anda.` | selalu |
| 6 | `Reset Data` | (3 baris, lihat 6.12.8) | selalu |

Section 1–5 punya inline `marginBottom: 16`; section 6 tidak.

### 6.12.3 Section 1 — `Alat Keuangan`

Dua tombol `.btnPrimary` full-width (`display:flex; align-items:center;
justifyContent:center; gap:8`):

| Tombol | Warna | Aksi |
|---|---|---|
| `📖 Bantuan & Panduan` | inline `#6366F1` | `setPage('help')` |
| `🔥 Kalkulator FIRE` | inline `#F59E0B` | `setPage('fire')` |

Yang pertama punya inline `marginBottom: 10`.

> **Tidak ada kontrol tema di halaman ini.** Lihat Part 8.29.

### 6.12.4 Section 2 — `Ekspor Data`

**Pemilih format** — flex `gap: 16; marginBottom: 16`, dua `<label>` radio
(`name="exportFormat"`, `style={{accentColor:'#4F6EF7'}}`, `fontSize: 14`,
`color: var(--text-1)`, `cursor: pointer`, `fontWeight: 600` saat aktif else 400):
`JSON` · `CSV (ZIP)`

**Submit:** `.btnPrimary` — label **`Ekspor`**; saat `exporting` → spinner 14×14
(`border: 2px solid rgba(255,255,255,0.3)`, `borderTopColor: '#fff'`,
`animation: spin 0.8s linear infinite`) + teks **`Mengekspor...`**; disabled dengan
`opacity .6; cursor: not-allowed`.

```css
.btnPrimary { padding: 10px 20px; border-radius: 8px; border: none;
              font-size: 14px; font-weight: 600; background: #4F6EF7;
              color: white; transition: all .15s; }
.btnPrimary:hover    { opacity: .88; }
.btnPrimary:disabled { opacity: .6; cursor: not-allowed; }
```

**Berkas yang dihasilkan:**

| Format | Nama file | Isi |
|---|---|---|
| JSON | `budgetku-export-YYYY-MM-DD.json` | `buildBudgetXJson({wallets, transactions, budgets, categories, preferences})` |
| CSV-ZIP | `budgetku-export-YYYY-MM-DD.csv.zip` | `wallets.csv`, `transactions.csv`, `budgets.csv`, `categories.csv` (tiap-entry UTF-8 BOM) |

**Header kolom CSV** (referensi round-trip):

| Berkas | Header |
|---|---|
| `wallets.csv` | `ID,Nama,Tipe,Saldo,Warna,Catatan` |
| `transactions.csv` | `ID,Tanggal,Dompet,Tipe,Kategori,Jumlah,Catatan,Tag,Dompet Tujuan,_walletId,_categoryId,_toWalletId` |
| `budgets.csv` | `Periode,Total Pemasukan,Bagian,Kategori,Alokasi,_categoryId` |
| `categories.csv` | `ID,Nama,Bagian,Warna` |

Toast: sukses **`Data berhasil diekspor`** · gagal **`Gagal membuat file CSV`** (CSV)
atau **`Gagal mengunduh file`** (JSON).

### 6.12.5 Section 3 — `Impor Cadangan`

Deskripsi: `Pulihkan data dari file cadangan BudgetX (JSON atau ZIP).`

Hidden `<input ref={fileInputRef} type="file" accept=".json,.zip" style={{display:'none'}}>`
+ `.btnPrimary` **`Pilih File`** (disabled saat `importing`).
Nilai input di-reset setelah tiap pick agar file sama bisa dipilih ulang.

**Alur `handleFileSelect`:**

1. `> 10MB` (`MAX_FILE_SIZE = 10 * 1024 * 1024`) → toast **`File terlalu besar (maks 10MB)`**
2. `.zip` (ekstensi atau MIME `application/zip`) → `readAsArrayBuffer` + `parseCsvZip`
3. selain itu → `readAsText` + `parseAndValidate`
4. kedua jalur → `validateEntities`; gagal → toast **`Data tidak valid: {errors[0]}`**
5. `reader.onerror` → toast **`Gagal membaca file`**
6. sukses → set `importData`, `importSummary` (`{wallets, transactions, budgets:Object.keys(...).length, categories}`),
   `showImportConfirm: true` → buka `ImportConfirmModal`

**Pesan error import yang mungkin muncul** (`services/importService.js`):
`File bukan JSON yang valid` · `Bukan file ekspor BudgetX` ·
`Versi file tidak kompatibel dengan aplikasi ini` · `Struktur data tidak valid` ·
`File ZIP tidak valid` · `File "{f}" tidak ditemukan dalam ZIP` ·
prefixed: `Dompet #n:` · `Transaksi #n:` · `Anggaran {monthKey}:` · `Kategori #n:`

### 6.12.6 Section 4 — `Impor Data CSV`

Deskripsi: `Impor data dari file CSV. Pilih file yang ingin Anda impor (minimal 1).`

#### Contoh Format — `<details>`

`<summary>` = **`📋 Lihat contoh format CSV`**
(13px/600 `#4F6EF7`, `list-style: none`, `::-webkit-details-marker { display: none }`,
`::before { content: '▶'; font-size: 9px }`, rotate 90° saat `[open]`)

`.formatExamplesContent`: `marginTop: 10`, `padding: 12`,
`background: var(--bg-2)`, radius 8, `border: 1px solid var(--border-2)`

Tiga blok, masing-masing `<strong>` + `<pre>` (11px `var(--text-3)`,
`background: var(--bg-card)`, `overflow-x: auto`, `white-space: pre`,
`font-family: 'SF Mono','Fira Code',monospace`, `line-height: 1.5`):

**`📄 Transaksi:`**
```
Tanggal,Tipe,Jumlah,Kategori,Sub Kategori,Dompet,Ke Dompet,Catatan
2026-05-03,EXPENSE,38000,Kebutuhan,Makan,BRI - A,,Makan malam
2026-05-01,INCOME,14000000,Pemasukan,Gaji,BRI - A,
2026-05-01,TRANSFER,200000,,,BRI - A,GoPay,
```

**`📊 Budget:`**
```
Periode,Total Pemasukan,Bagian,Kategori,Alokasi
2026-05,15000000,Kebutuhan,Makan,2000000
2026-05,15000000,Keinginan,Hobby,500000
2026-05,15000000,Tabungan,Deposito,3000000
```

**`💰 Dompet:`**
```
Nama,Tipe,Saldo,Catatan
BRI - A,Bank,5000000,Tabungan
GoPay,E-Wallet,100000,
Cash,Tunai,50000,
```

**Footer note** (11px `var(--text-5)`, tiga baris pisah `<br/>`):
```
Tipe dompet: Bank, E-Wallet, Kartu Kredit, PayLater, Tunai
Tipe transaksi: EXPENSE, INCOME, TRANSFER
Bagian budget: Kebutuhan, Ke keinginan, Tabungan
```

#### Tiga Slot Import

`.importSlot`: flex, gap 12, `padding: '10px 14px'`, radius 8,
`border: 1px solid var(--border-2)`, `marginBottom: 8`

| Slot | Ikon | Label | Kosong | Terisi |
|---|---|---|---|---|
| transactions | `📄` | `Transaksi` | hidden input + `.importSlotBtn` **`Pilih File`** + `(belum dipilih)` | `✅` + `{name} ({rowCount} baris)` + tombol `×` `aria-label="Hapus file transaksi"` |
| budgets | `📊` | `Budget` | idem | `{name} ({rowCount} periode)` · `aria-label="Hapus file budget"` |
| wallets | `💰` | `Dompet` | idem | `{name} ({rowCount} dompet)` · `aria-label="Hapus file dompet"` |

```css
.importSlotLabel  { font-size: 13px; font-weight: 600; color: var(--text-2);
                    min-width: 80px; }
.importSlotFile   { font-size: 12px; color: var(--text-4); ellipsis; }
.importSlotCheck  { color: #22C55E; }
.importSlotRemove { font-size: 18px; font-weight: 700; color: var(--text-5); }
.importSlotRemove:hover { color: #DC2626; background: rgba(220,38,38,0.08); }
.importSlotBtn    { padding: 5px 12px; border-radius: 6px;
                    border: 1px solid var(--border-2); background: var(--bg-card);
                    color: var(--text-3); font-size: 12px; font-weight: 600; }
.importSlotBtn:hover   { border-color: #4F6EF7; color: #4F6EF7; }
.importSlotBtn:disabled{ opacity: .5; }
```

#### Banner Error

`csvError` inline: 13px/600, `#F87171`, `background: rgba(220,38,38,0.08)`,
radius 8, `padding: '10px 14px'`, `marginTop: 12`.
Fallback: **`Gagal mengimpor data CSV`**

#### Submit

`.btnPrimary` (`marginTop: 16`) — **`Impor`**, busy **`Mengimpor...`** (spinner sama);
disabled bila tidak ada file dipilih atau busy.

**Urutan `handleCsvImport`:**

1. **Dompet dulu** — lewati wallet yang `name` lowercase-nya sudah ada,
   `onImportData({wallets, transactions:[], budgets:{}, categories:[]}, 'append')`
2. **Transaksi** — re-parse dengan daftar wallet gabungan via `parseTransactionCsv`,
   tambah `newCategories` dari `result.newCategories`
3. **Budget** — `parseBudgetCsv` + `newCategories`-nya

Toast sukses: **`Impor CSV selesai: {parts.join(', ')}`** dengan parts dari
`` `${n} dompet` `` · `` `${n} transaksi` `` · `` `${n} periode anggaran` `` ·
`` `${n} kategori baru` ``; fallback **`tidak ada data baru`**.

> ⚠️ **Setiap file memicu panggilan `onImportData` terpisah** — kegagalan di langkah 2
> meninggalkan langkah 1 sudah diterapkan. Tidak ada rollback. Lihat Part 8.30.

**Error parser CSV yang mungkin muncul:**
`File CSV kosong atau tidak memiliki data` ·
`Kolom CSV tidak lengkap: {list}` (wajib: transactions `Tanggal, Tipe, Jumlah, Dompet`;
budgets `Periode, Total Pemasukan, Bagian, Kategori, Alokasi`;
wallets `Nama, Tipe, Saldo`) ·
`Dompet tidak ditemukan: {names}. Buat dompet tersebut terlebih dahulu.`
(transactions saja, pencocokan exact case-sensitive).

### 6.12.7 Section 5 — `Kelola Kategori`

Deskripsi: `Atur kategori pengeluaran dan pemasukan Anda.`

Iterasi `SECTION_ORDER = ['needs','wants','savings','income']` dengan
`SECTION_LABELS = { needs: 'Kebutuhan', wants: 'Ke keinginan', savings: 'Tabungan',
income: 'Pemasukan' }`

#### Header Section — Bisa Dilipat

`<button class="catSectionTitle">` (full-width, flex `space-between`, 13px/700 uppercase
`letter-spacing: .5px`, `var(--text-3)`, `padding: '8px 4px'`,
`border-bottom: 1px solid var(--border-2)`, background transparan)

Isi: **`{SECTION_LABELS[section]} ({count})`** — mis. `Kebutuhan (5)` — plus chevron
SVG 14×14 (`<polyline points="6 9 12 15 18 9">`) dengan
`transform: rotate(-90deg)` saat tertutup, `rotate(0deg)` saat terbuka,
`transition: transform .2s`.

> `aria-expanded` **tidak** diset di sini (diset di HelpPage).

#### Baris Kategori

`.catItem` (flex, gap 10, `padding: '7px 4px'`, radius 8, hover `var(--bg-hover, rgba(0,0,0,0.03))`):

```
.catItemDot  /* 10×10 circle, background cat.color */
.catItemName /* flex 1, 14px var(--text-1), ellipsis */
.catItemActions
  button  aria-label="Edit {cat.name}"  → <NavIcon name="edit" size={14}/>
  button  aria-label="Hapus {cat.name}" → <NavIcon name="trash" size={14}/>
```

Dua tombol 28×28, transparan, `color: var(--text-4)`; hover `background: var(--bg-hover)`
+ `color: var(--text-1)`. **Tombol terakhir berubah `#DC2626` saat hover.**

Kategori dalam tiap section diurutkan `a.name.localeCompare(b.name, 'id')`.

#### Form Edit Inline

`editingCatId === cat.id` → `.catEditForm` (padding 10, radius 8,
`background: var(--bg-hover, rgba(0,0,0,0.02))`, `border: 1px solid var(--border-2)`)

- `<input type="text" autoFocus>` placeholder **`Nama kategori`**, full-width,
  `padding: '7px 10px'`, radius 6, `border: 1px solid var(--border-2)`,
  `background: var(--bg-card)`, 13px; focus border `#4F6EF7`
- `.catColorPalette` (flex wrap, gap 6) → 20 `.catColorSwatch` (22×22 circle,
  `border: 2px solid transparent`); terpilih → `.catColorSwatchSelected`
  (`border-color: var(--text-1); transform: scale(1.15)`); hover `scale(1.15)`.
  `aria-label` = `Warna {hex}`
- `.catEditFormActions` → **`Simpan`** (first-child, `background:#4F6EF7; color:white`)
  dan **`Batal`** (last-child, transparan, `var(--text-4)` → hover `var(--text-1)`),
  `padding: 5px 12px`, radius 6, 12px/600

**20 warna kategori** (`COLORS`, urut):
```
#F59E0B  #3B82F6  #8B5CF6  #EF4444  #06B6D4
#EC4899  #F97316  #EAB308  #A855F7  #14B8A6
#64748B  #22C55E  #10B981  #059669  #6366F1
#DC2626  #16A34A  #2563EB  #9333EA  #0891B2
```

> ⚠️ Array 20 warna ini **terduplikasi** di `importService.js:177-181` dan `:288-293`.

#### Form Tambah Inline

`addingSection === section` — identik, tapi placeholder **`Nama kategori baru`**,
warna default `#64748B`, aksi **`Tambah`** / **`Batal`**.

**Trigger:** `.catAddBtn` (dashed `1px dashed var(--border-2)`, radius 6, mt 6, 13px
`var(--text-4)`) → `<NavIcon name="plus" size={13}/>` + **`Tambah Kategori`**;
hover border + teks `#4F6EF7` di `rgba(79,110,247,0.04)`.

#### Guard Hapus Kategori

`handleDeleteCat(cat)` **lebih dulu** mengecek pemakaian:

1. transaksi dengan `t.categoryId === cat.id`
2. alokasi budget: `budget.sections[*].cats[*].id === cat.id`

Bila terpakai → toast
**`Tidak dapat menghapus '{cat.name}' — sedang digunakan di {parts}`**
(`parts` = `` `${n} transaksi` `` dan/atau `alokasi budget`, digabung `' dan '`),
**tanpa dialog**.

Bila tidak terpakai → `window.confirm(`Hapus kategori '${cat.name}'?`)` (dialog native,
bukan Modal) → `onDeleteCategory` → toast **`Kategori berhasil dihapus`**.

Toast lain: **`Kategori berhasil diperbarui`** · **`Kategori berhasil ditambahkan`**

### 6.12.8 Section 6 — `Reset Data` (Danger Zone)

**Deskripsi (3 baris):**
```
Menghapus semua data Anda secara permanen, termasuk dompet, transaksi,
anggaran, kategori, dan preferensi. Data yang sudah dihapus tidak dapat
dikembalikan.
```

**Tombol** `.btnDanger` — label **`Reset Data`**; `padding: 10px 20px`, radius 8,
`border: none`, 14px/600, `background: #DC2626`, `color: white`, hover `opacity: .88`.
Membuka `ResetConfirmModal`.

**Aksi konfirmasi** (`App.handleResetData`): `api.resetUserData()` + `fetchAllData()` +
`setPage('dashboard')` + toast **`Data berhasil direset.`**

### 6.12.9 `ResetConfirmModal`

`<Modal title="Reset Data" onClose={handleClose} width={440}>`

**Paragraf** (13px `var(--text-3)`, `lineHeight 1.6`, mb 16):
```
Tindakan ini akan menghapus semua data Anda secara permanen, termasuk:
```
(`semua data` dibungkus `<strong>`)

**Daftar** (`ul`, `paddingLeft: 20`, `lineHeight 1.8`, mb 20) — **tepat 5 item:**
```
Dompet (wallets)
Transaksi (transactions)
Anggaran (budgets)
Kategori (categories)
Preferensi (preferences)
```

**Loading** (`loading`): paragraf **`Menghapus data...`**
(13px/600, `#FBBF24`, `background: rgba(245,158,11,0.08)`, radius 8,
`padding: '10px 14px'`, mb 16) — teks saja, tanpa spinner.

**Error** (13px/600, `#F87171`, `rgba(220,38,38,0.08)`).
Fallback: **`Terjadi kesalahan saat menghapus data.`** — input keamanan dikosongkan.

**Label** (13px/600 `var(--text-4)`, mb 8): `Ketik "Delete" untuk mengonfirmasi`
(`"Delete"` dibungkus `<strong>`)

**Input:** `type="text"`, placeholder **`Delete`**, disabled saat loading;
`width: 100%`, `padding: '10px 14px'`, radius 8, `border: 1.5px solid var(--border)`,
`background: var(--bg-2)`, `color: var(--text-1)`, 14px, `outline: none`,
`marginBottom: 20`, `transition: border-color .15s`

**Gate:** `canConfirm = safetyInput === 'Delete' && !loading` — **case-sensitive**.

**Aksi** (flex, gap 10, `justify-content: flex-end`):

| Tombol | Style |
|---|---|
| `Batal` | secondary: `border 1.5px solid var(--border)`, `background: var(--bg-2)`, `color: var(--text-3)`, 14px/600; disabled + `opacity .5` |
| `Konfirmasi` | `background: canConfirm ? '#DC2626' : '#FCA5A5'`, `color: white`; disabled kecuali `canConfirm`; `opacity: canConfirm ? 1 : .6` |

Tidak ada pemblokiran Escape saat konfirmasi; menutup saat loading dicegah oleh
`handleClose`.

### 6.12.10 `ImportConfirmModal`

`<Modal title="Impor Data" onClose={handleClose} width={480}>`

**Panel ringkasan** (inline `background: var(--bg-2)`, radius 10, `padding: '14px 16px'`,
mb 20, `border: 1px solid var(--border-2)`):

- `Data ditemukan:` (13px/600 `var(--text-4)`, `margin: '0 0 4px'`)
- `summaryText` (14px/500 `var(--text-1)`) = `.filter(Boolean).join(', ')` dari
  `` `${n} dompet` `` · `` `${n} transaksi` `` · `` `${n} anggaran` `` · `` `${n} kategori` ``.
  **Fallback: `Tidak ada data`**

**Loading** (`loading`): flex row, gap 10, `padding: '12px 16px'`,
`background: rgba(245,158,11,0.08)`, radius 8, mb 16 → spinner 18×18
(`border: 2px solid #D97706`, `borderTopColor: 'transparent'`, `spin 0.8s linear infinite`)
+ teks (13px/600 `var(--text-2)`):

| Kondisi | Teks |
|---|---|
| `selectedMode === 'replace'` | `Mengganti data...` |
| selainnya | `Menggabungkan data...` |

**Error:** 13px/600, `#F87171`, `rgba(220,38,38,0.08)`, radius 8,
`padding: '10px 14px'`, mb 16. Fallback **`Gagal mengimpor data`**.

**Pemilihan mode** (hanya saat `!loading`), dua cabang:

**(a) `isCsvImport === true`**

Teks informatif (13px/500 `var(--text-4)`, mb 16):
```
Transaksi dari file CSV akan ditambahkan ke data yang ada.
```
+ (bila `importSummary.categories > 0`) `` {n} kategori baru akan dibuat otomatis. ``

Aksi (rata kanan, flex gap 10): **`Batal`** (secondary) dan **`Impor`** (`#4F6EF7`).

**(b) selainnya**

Prompt **`Pilih metode impor:`** (13px/600 `var(--text-4)`, mb 12), lalu dua kartu
full-width (`display: block; textAlign: left; padding: '14px 16px'`; radius 10;
`border: 1.5px solid var(--border)`; `background: var(--bg-card)`):

| Kartu | Judul (14px/700 `var(--text-1)`) | Sub (12px/500) | `onConfirm` |
|---|---|---|---|
| 1 | `Ganti Semua (Replace)` | `#DC2626` — `⚠️ Semua data yang ada akan dihapus dan diganti dengan data impor` | `'replace'` |
| 2 | `Gabungkan (Append)` | `var(--text-4)` — `Data baru akan ditambahkan, data yang sudah ada tidak berubah` | `'append'` |

Kemudian tombol **`Batal`** rata kanan.

**Toast sukses** (`SettingsPage.handleImportConfirm`):

| Jalur | Toast |
|---|---|
| CSV | `` Impor CSV selesai: {n} transaksi diimpor `` + `` {m} kategori baru dibuat `` bila `m > 0` |
| append | `` Impor selesai: {added} ditambahkan, {skipped} dilewati `` |
| replace | **`Data berhasil diimpor`** |

`handleImportConfirm` memaksa `effectiveMode = 'append'` bila `importData._csvImport`.

> ⚠️ **Cabang (a) adalah dead code.** `showImportConfirm` hanya di-set oleh
> `handleFileSelect` (jalur JSON/ZIP) yang **tidak pernah** menyetel `_csvImport` —
> dan importer 3-slot CSV melewati modal ini sepenuhnya. Lihat Part 8.31.

### 6.12.11 Responsive

**Satu** `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.pageTitle` | 22px → **18px** |
| `.sectionCard` | `padding: 20px 24px` → `14px 16px` |

**Tidak ada collapse lain:** `.catItem`, `.importSlot` (sudah flex-wrap-safe; label
`min-width` 80px), baris radio export. Blok `<pre>` di `<details>` scroll horizontal
via `overflow-x: auto`.

### 6.12.12 Token Warna

Dipakai: `--bg-card`, `--bg-2`, `--bg-hover` (**tidak terdefinisi** → selalu fallback
`rgba(0,0,0,0.03 / 0.06 / 0.02)`), `--border`, `--border-2`, `--text-1..5`.

Hardcoded: `#4F6EF7` (primary, radio accent, focus border, hover accent) ·
`#DC2626` (danger, delete hover) · `#22C55E` (centang slot import) ·
`#FCA5A5` (danger disabled di ResetConfirmModal) · `#F87171` (teks error) ·
`#6366F1` / `#F59E0B` (tombol Alat Keuangan) · 20 hex palet di `COLORS`.

---

## 6.13 Bantuan & Panduan

`src/pages/Help/HelpPage.jsx` (196) + `HelpPage.module.css` (189).

### 6.13.1 Layout & Header

```css
.wrapper   { max-width: 720px; margin: 0 auto; animation: fadeInUp .3s ease-out; }
.header    { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.backBtn   { width: 36px; height: 36px; border-radius: 10px; padding: 0;
             border: 1px solid var(--border); background: var(--bg-card);
             color: var(--text-3); }   /* arrow-left SVG 18px */
.title     { font-size: 20px; font-weight: 800; color: var(--text-1); }
.subtitle  { font-size: 13px; color: var(--text-4); line-height: 1.5;
             margin-bottom: 20px; }
```

> **Beda dari FirePage:** `max-width` di sini **720px** (bukan 900px) dan memakai
> `.wrapper` miliknya sendiri, bukan measure `pageMeasureTight` 680px shell.

| Elemen | Isi |
|---|---|
| `backBtn` | SVG arrow-left 18×18 (`<path d="M19 12H5"/>` + `<polyline points="12 19 5 12 12 5"/>`), `aria-label="Kembali"`, `onClick={() => setPage('settings')}` |
| `<h1>` | `Bantuan & Panduan` |
| Subtitle | `Panduan lengkap menggunakan BudgetX. Klik topik untuk melihat langkah-langkahnya.` |

### 6.13.2 Struktur Accordion

```css
.accordion { display: flex; flex-direction: column; gap: 8px; }
.section   { background: var(--bg-card); border: 1px solid var(--border-2);
             border-radius: 12px; overflow: hidden; }
.sectionOpen { border-color: var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.sectionHeader { width: 100%; padding: 14px 16px; background: transparent;
                 text-align: left; min-height: auto; }
.sectionHeader:hover { background: var(--bg-3); }
.sectionTitle { font-size: 14px; font-weight: 600; color: var(--text-1); }
.chevron     { width: 16px; height: 16px; color: var(--text-4);
               transition: transform .25s ease; }
.chevronOpen { transform: rotate(180deg); }
.sectionContent { padding: 0 16px 16px; animation: slideDown .2s ease-out; }
.stepsList  { display: flex; flex-direction: column; gap: 10px; }
.step       { display: flex; align-items: flex-start; gap: 10px; }
.stepNumber { width: 22px; height: 22px; border-radius: 50%;
              background: rgba(79,110,247,0.1); color: #4F6EF7;
              font-size: 11px; font-weight: 700; display: grid; place-items: center; }
.stepText   { font-size: 13px; color: var(--text-2); line-height: 1.5; }
```

**Perilaku:** `expanded` adalah **satu id**, jadi accordion — **hanya satu terbuka
sekaligus** (`setExpanded(prev => prev === id ? null : id)`).
`aria-expanded={isOpen}` **diset** di sini (berbeda dari header kategori Pengaturan).

### 6.13.3 Sepuluh Topik dan Seluruh Langkahnya (verbatim)

#### 1. `🚀 Memulai` (`getting-started`, 5 langkah)
1. `Daftar akun atau masuk dengan email Anda.`
2. `Buat dompet pertama Anda (contoh: BRI, GoPay, Cash).`
3. `Catat transaksi pertama dengan menekan tombol "+" di bottom bar.`
4. `Atur budget bulanan di menu Budget.`
5. `Pantau pengeluaran Anda di Dashboard.`

#### 2. `💸 Transaksi` (`transactions`, 7 langkah)
1. `Klik tombol "+" (biru) di bottom bar untuk menambah transaksi baru.`
2. `Pilih tipe: Pengeluaran, Pemasukan, atau Transfer antar dompet.`
3. `Isi jumlah, pilih kategori dan dompet sumber.`
4. `Tambahkan catatan (opsional) untuk referensi.`
5. `Untuk transfer, pilih dompet tujuan.`
6. `Edit atau hapus transaksi dari halaman Transaksi.`
7. `Gunakan filter untuk mencari transaksi tertentu.`

#### 3. `📊 Budget & Anggaran` (`budget`, 6 langkah)
1. `Buka menu Budget dari sidebar atau bottom nav.`
2. `Klik "Atur Pemasukan" untuk memasukkan total pendapatan bulanan.`
3. `Alokasikan budget ke 3 seksi: Kebutuhan (50%), Ke keinginan (30%), Tabungan (20%).`
4. `Klik "Edit" pada setiap seksi untuk mengatur alokasi per kategori.`
5. `Dashboard akan menampilkan progress penggunaan budget.`
6. `Budget yang melebihi alokasi akan ditandai merah.`

#### 4. `🔄 Barang Berkala` (`recurring`, 6 langkah)
1. `Buka menu Berkala untuk mengelola item yang dibeli rutin.`
2. `Klik "Tambah" dan isi nama item (contoh: Shampoo, Pasta Gigi).`
3. `Masukkan harga, tanggal pembelian terakhir, dan estimasi durasi pemakaian.`
4. `BudgetX akan menghitung biaya bulanan (amortized cost).`
5. `Notifikasi akan muncul saat item perlu dibeli ulang.`
6. `Klik "Beli Ulang" untuk mencatat pembelian dan otomatis membuat transaksi.`

#### 5. `🤝 Utang/Piutang` (`debt`, 7 langkah)
1. `Buka menu Utang/Piutang dari sidebar.`
2. `Klik "Tambah" untuk mencatat utang atau piutang baru.`
3. `Pilih tipe: Utang (saya pinjam) atau Piutang (saya pinjamkan).`
4. `Isi nama orang, jumlah, dan tanggal jatuh tempo (opsional).`
5. `Untuk pinjaman berbunga, aktifkan toggle "Bunga Anuitas".`
6. `Catat cicilan dengan klik "Bayar" pada card.`
7. `Status otomatis berubah ke "Lunas" saat pembayaran selesai.`

#### 6. `📈 Investasi` (`investment`, 7 langkah)
1. `Buka menu Investasi dari sidebar.`
2. `Klik "Tambah" untuk menambah aset investasi baru.`
3. `Pilih jenis: Deposito, Saham, Reksadana, Crypto, Emas, dll.`
4. `Isi detail seperti nama aset dan platform.`
5. `Catat pembelian dengan klik "Beli" pada card investasi.`
6. `Catat penjualan dengan klik "Jual".`
7. `Update nilai saat ini untuk melihat profit/loss.`

#### 7. `🔥 FIRE Calculator` (`fire`, 6 langkah)
1. `Akses FIRE Calculator dari Pengaturan → Alat Keuangan.`
2. `Masukkan data: pengeluaran bulanan, portfolio saat ini, tabungan per bulan.`
3. `Atur asumsi: inflasi, return investasi, safe withdrawal rate.`
4. `Lihat proyeksi waktu mencapai FIRE number.`
5. `Bandingkan 3 skenario: konservatif, moderat, agresif.`
6. `Sesuaikan strategi berdasarkan hasil simulasi.`

> ⚠️ Langkah 3 menyebut `safe withdrawal rate` — **bukan** label kontrol yang ada
> di halaman FIRE. Bandingkan `Alokasi Pendapatan` + `Asumsi Pasar` (Part 6.11).
> Lihat Part 8.33.

#### 8. `📋 Laporan` (`reports`, 5 langkah)
1. `Buka menu Laporan untuk analisis keuangan.`
2. `Lihat ringkasan bulanan: pemasukan vs pengeluaran.`
3. `Analisis pengeluaran per kategori dengan chart.`
4. `Bandingkan tren pengeluaran antar bulan.`
5. `Gunakan filter periode untuk melihat rentang tertentu.`

#### 9. `⚙️ Pengaturan` (`settings`, 5 langkah)
1. `Export data ke JSON (backup lengkap) atau CSV (spreadsheet).`
2. `Import data dari file backup untuk memulihkan data.`
3. `Kelola kategori: tambah, edit, atau hapus kategori.`
4. `Ganti tema: Dark Mode atau Light Mode.`
5. `Reset data: menghapus semua data (irreversible, export dulu!).`

> ⚠️ Langkah 4 **tidak mungkin dilakukan** — tidak ada kontrol tema di Pengaturan.
> Tema hanya di sidebar (desktop) dan dropdown mobile. Lihat Part 8.29.

#### 10. `💡 Tips Keuangan` (`tips`, 7 langkah)
1. `Gunakan aturan 50/30/20: 50% kebutuhan, 30% keinginan, 20% tabungan.`
2. `Catat SEMUA pengeluaran, sekecil apapun — awareness adalah langkah pertama.`
3. `Review budget mingguan untuk tetap on track.`
4. `Siapkan dana darurat minimal 3-6 bulan pengeluaran.`
5. `Automasi tabungan: alokasikan di awal bulan, bukan sisa akhir bulan.`
6. `Gunakan fitur Barang Berkala untuk tahu "biaya hidup sebenarnya".`
7. `Pantau rasio utang — idealnya cicilan < 30% dari pendapatan.`

### 6.13.4 State

**Tidak ada** loading / error / empty state. Konten adalah konstanta statis di
module scope.

### 6.13.5 Responsive

**Satu** `@media (max-width: 768px)`:

| Selektor | Perubahan |
|---|---|
| `.title` | 20px → **18px** |
| `.sectionHeader` | `padding: 14px 16px` → `12px 14px` |
| `.sectionTitle` | 14px → **13px** |
| `.stepText` | 13px → **12.5px** |

Badge nomor langkah dan layout tidak berubah.

---

# Part 7 — Cross-Cutting Patterns

Pola-pola ini yang **benar-benar dipakai** di 5+ halaman. Ikuti ini, bukan `base.css`.

## 7.1 Anatomi Halaman CRUD ("Tiga Kartu + Filter + Kartu")

Lima halaman memakai anatomi yang nyaris identik: `RecurringPage`, `SubscriptionPage`,
`DebtPage`, `InvestmentPage`, `WalletPage`.

```
.pageHeader          → h1 .pageTitle + p .pageSubtitle + .headerActions / .addBtn
.summaryGrid         → 3 atau 4 .summaryCard
                      .summaryLabel (uppercase 11px) + .summaryValue (18px/700) + .summarySub (12px)
.filters             → .filterBtn pill (opsional — Tx & Report tidak punya)
.card / .cardRow     → daftar item
  .cardIcon            34–38px, radius 9–10
  .cardInfo            flex 1, min-width 0
    .cardName / .itemName
    .cardMeta / .itemMeta
  .cardRight / .itemRight
    nilai + badge + tombol aksi + .actions
.emptyState          → opsional, hanya saat data kosong
```

### Nilai `border-radius` per halaman

| Halaman | `.card` | `.summaryCard` | `.addBtn` | `.filterBtn` |
|---|---|---|---|---|
| Dompet | `14px` (WalletCard) | `14px` | — | — |
| Transaksi | `16px` | — | — | — |
| Budget | `14px` | — | — | — |
| Barang Berkala | `16px` | `16px` | `10px` | — |
| Langganan | `16px` | `16px` | `10px` | `20px` |
| Utang/Piutang | `16px` | `16px` | `10px` | `20px` |
| Investasi | `16px` | `16px` | `10px` | `20px` |
| Dashboard | `16px` | — | — | — |
| Laporan | `16px` | — | — | — |
| Kesehatan Keuangan | `16px` | — | — | — |

**Lebih banyak `16px` daripada `14px`.** `14px` hanya di Dompet & Budget (serta
sub-kartu mereka). Ambil `16px` sebagai default baru.

## 7.2 Pola Tombol

| Class | Pemakaian | Styling |
|---|---|---|
| `.addBtn` | header halaman Berkala/Langganan/Utang/Investasi | `padding 10px 18px`, radius 10, `#4F6EF7` → hover `#3B5DE7`, `#fff`, 13px/600 |
| `.btnPrimary` | header Dompet & Transaksi | `padding 8px 14px`, radius 8, `#4F6EF7`, `#fff`, 13px/600 |
| `.btnGhost` | header Dompet & Budget | `padding 8px 14px`, radius 8, `border 1.5px var(--border)`, `bg var(--bg-2)`, `var(--text-3)`, 13px/600 |
| `.btnGhost` (Dashboard) | card action | `padding 6px 12px`, radius 8, **sama** tapi 12px/600 |
| `.linkBtn` | link teks di card Dashboard | 12px/600, `#4F6EF7`, tanpa background/border |
| `.saveBtn` | submit di semua modal | full-width, `#4F6EF7` → hover `#3B5DE7`, `#fff`, 14px/600, radius 8–10, padding 10–12 |
| `.deleteBtn` | hapus di modal | full-width, `border 1px solid #FCA5A5`, transparan → hover `rgba(220,38,38,0.1)`, `#DC2626`, 13px/600 |
| `.btnDanger` | Reset Data | `padding 10px 20px`, radius 8, `#DC2626`, `#fff`, 14px/600 |
| `.btnSmallPrimary` / `.btnSmallGhost` | inline edit kategori Budget | `padding 5px 12px`, radius 6, 12px/600 |
| `.iconBtn` / `.iconBtnDanger` | ikon 30×30 / 28×28 | radius 8, `border 1px solid var(--border)`, `bg var(--bg-2)` |

**Hover `#4F6EF7` = `#3B5DE7` konsisten di seluruh app.** Quand hover `<button>` global
`opacity: .88` ikut berlaku.

## 7.3 Pola Badge

```css
.badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 6px;
         white-space: nowrap; text-transform: uppercase; letter-spacing: .03em; }
```

| Semantik | Contoh | Background | Teks |
|---|---|---|---|
| Utang / loss | `Utang`, `Terlambat`, `OVER` | `rgba(220,38,38,0.1)` | `#F87171` |
| Piutang / info | `Piutang` | `rgba(37,99,235,0.1)` | `#60A5FA` |
| Anuitas / segera | `{rate}% Anuitas` | `rgba(217,119,6,0.1)` | `#FBBF24` |
| Lunas / aktif | `Lunas`, `Aktif` | `rgba(22,163,74,0.1)` | `#4ADE80` |
| Netral | `Tidak Aktif` | `rgba(100,116,139,0.1)` | `#94A3B8` |
| Tipe | badge tipe investasi | `rgba(79,110,247,0.1)` | `#60A5FA` |
| Over-budget | `Melebihi Batas` | `rgba(220,38,38,0.1)` | `#F87171` |

> **Semua badge uppercase** karena `text-transform: uppercase` di `.badge`. Badge yang
> sengaja **tidak** uppercase (inline, bukan `.badge`): `MELEBIHI!`, `OVER`, `Sudah Beli`,
> `Segera`, `Terlambat`, `Hari ini`, `{N} hari`.

## 7.4 Pola `.filterBtn` — dan Inkonsistensi Mobile

```css
/* Desktop */
.filterBtn        { padding 8px 16px; border-radius 20px; border 1px solid var(--border);
                    background transparent; color var(--text-3); font-size 13px; font-weight 500; }
.filterBtn:hover  { background var(--bg-3); color var(--text-2); }
.filterBtnActive  { background var(--bg-3); color var(--text-1); border-color transparent; }

/* Mobile (≤768px) — di-override */
.filterBtn        { font-size 12px; font-weight 600; }
.filterBtnActive  { background #4F6EF7; color #fff; border-color #4F6EF7; border-radius 20px; }
```

> **Perilaku aktif berubah total antar breakpoint:** desktop = netral subtle,
> mobile = **filled accent**. Halaman yang meng-override `.filterBtnActive` di mobile:
> Langganan, Utang, Investasi. Yang **tidak** punya filter pill: Transaksi (pakai
> `.dateModeTab` + `MultiChip`), Dompet, Budget, Dashboard, Laporan, FIRE, Aset.
> Lihat Part 8.34.

## 7.5 Pola Card di Mobile (`.cardRight` Jatuh Baris)

Tiga halaman memakai pola identik — `.cardRow { flex-wrap: wrap }` +
`.cardRight { width: 100%; justify-content: flex-end; margin-top: 8px }`:
**Barang Berkala · Langganan · Utang/Piutang · Investasi**

```css
@media (max-width: 768px) {
  .cardRow   { flex-wrap: wrap; }
  .cardRight { width: 100%; justify-content: flex-end; margin-top: 8px; }
  .itemRight { /* identik, untuk Barang Berkala */ }
}
```

> **Investment** satu-satunya yang juga menambahkan `.actions { flex-wrap: wrap }`.

## 7.6 Tiga Mekanisme Hapus yang Berbeda

⚠️ **App ini punya tiga pola konfirmasi hapus yang tidak seragam:**

| Mekanisme | Halaman | Perilaku |
|---|---|---|
| **`window.confirm`** | Dompet (`Hapus dompet ini?`), Pengaturan kategori (`Hapus kategori '{nama}'?`) | Dialog native browser. Styling di luar kendali CSS. |
| **Klik ganda** | Utang/Piutang, Investasi, Aset tetap, Langganan, Budget | Label tombol berubah: `Hapus` → `Yakin hapus?` (atau `Yakin hapus aset ini?`). **Tidak ada timeout, tidak ada undo, dan tidak ada cara membatalkan** — label tetap "Yakin hapus?" sampai modal ditutup. |
| **Ketik kata sandi** | Reset Data | Ketik **`Delete`** (case-sensitive) untuk mengaktifkan tombol `Konfirmasi`. |

> Pola klik-ganda muncul di 5 modal berbeda dengan 2 variasi label. **Lihat Part 8.35.**

**Tombol hapus di kartu** — hanya di **Dompet** (`aria-label="Delete wallet"`).
Halaman lain: hapus hanya lewat Edit → modal. Lihat Part 8.18.

## 7.7 Pola Validasi — Routing Berbasis Substring

Halaman-halaman ini memetakan pesan validator ke field lewat `String.includes()`:

```jsx
// Pola yang dipakai di DebtFormModal, InvestmentFormModal, FixedAssetFormModal,
// PaymentModal, BuyModal, SellModal
if (error.includes('Nama'))            setErrors(e => ({...e, name: error}));
else if (error.includes('Dompet'))     setErrors(e => ({...e, walletId: error}));
else                                   setErrors(e => ({...e, _general: error}));
```

**Risikonya:** mengubah satu kata pada teks validator di `services/*Validator.js`
mengalihkan pesan ke field yang salah **tanpa error kompilasi dan tanpa test**.

**Tiga warna error yang dipakai:**

| Konteks | Warna | Class |
|---|---|---|
| Error inline pada `Field` | `#EF4444` | `Field` internal |
| Banner `_general` | `#DC2626` | inline `<div>` di dalam modal |
| Badge over | `#F87171` | `.badge*` |
| Error inline di Settings (import slot) | `#F87171` | `.csvError` |

> Lihat Part 8.22.

## 7.8 Matriks State Kosong

| Halaman | Loading | Error | Empty | Filtered-empty |
|---|---|---|---|---|
| Dashboard | ❌ | ❌ | ❌ | ❌ |
| Dompet | ❌ | ❌ | ❌ | ❌ |
| Transaksi | ❌ | ❌ | ✅ `Tidak ada transaksi ditemukan` | ✅ (yg sama, berbasis filter) |
| Budget | ❌ | ❌ | ❌ (semua nol) | ❌ |
| Barang Berkala | ❌ | ❌ | ✅ `Belum ada barang berkala` | ❌ |
| Langganan | ❌ | ❌ | ✅ `Belum ada langganan` | ✅ `Tidak ada data` |
| Utang/Piutang | ❌ | ❌ | ✅ `Belum ada catatan utang/piutang` | ❌ |
| Investasi | ❌ | ❌ | ✅ `Belum ada investasi` | ❌ |
| Kesehatan Keuangan | ❌ | ❌ | ❌ | ❌ |
| Laporan | ❌ | ❌ | ✅ parsial (`Tidak ada data`, `Belum ada kategori`) | ❌ |
| FIRE | ❌ | ❌ | ❌ (semua default) | ❌ |
| Pengaturan | ❌ | ✅ toast | ✅ (kategori: inline form) | ❌ |
| Bantuan | ❌ | ❌ | ❌ (statis) | ❌ |
| **HelpChat** | ❌ | ❌ | ✅ `Halo! 👋 …` | ❌ |

> **Tidak ada satu pun halaman** punya loading state sendiri atau error state sendiri.
> Keduanya ditangani 100% di shell (Part 2.5). **Jangan tambahkan spinner per halaman.**

## 7.9 Pola Enam Modus Hapus / Nonaktif

Halaman "status" (Barang Berkala, Langganan) memakai **toggle aktivitas** alih-alih
menghapus: tombol ikon `close` (saat aktif) / `check` (saat nonaktif) dengan
`title` `Non-aktifkan` / `Aktifkan`. Item nonaktif pindah ke grup `Non-aktif` dengan
badge abu-abu, dan tombol `Bayar` / `Sudah Beli` **sembunyi**.

---

# Part 8 — Audit & Inkonsistensi

> **Bagian ini bukan spesifikasi.** Isinya adalah temuan terhadap kode saat ini.
> Dicatat agar tidak ikut ditiru saat membangun ulang UI, dan agar mudah dilacak
> perbaikannya.

## 8.1 Font — Tiga Sumber, Satu Tidak Dimuat

| Sumber | Nilai |
|---|---|
| `index.html` | Memuat Google Fonts **IBM Plex Sans** + **IBM Plex Mono** |
| `tokens.css` | `--font-display`/`--font-body` = `"IBM Plex Sans"`, `--font-mono` = `"IBM Plex Mono"` |
| `App.css:19` | `html, body { font-family: 'Plus Jakarta Sans', sans-serif; }` |

`Plus Jakarta Sans` **tidak pernah dimuat** dan tidak punya token. Karena `App.css`
dimuat setelah `base.css`, **setiap elemen yang tidak mengatur `font-family` sendiri
memakai `'Plus Jakarta Sans'` → jatuh ke system sans.** `--font-mono` praktis tidak
berpengaruh di mana pun kecuali yang secara eksplisit memakainya.

## 8.2 Warna — `--accent` vs `#4F6EF7`

`--accent` adalah **cyan** `hsl(199 88% 42%)`. Hampir semua tombol berwarna **indigo**
`#4F6EF7`, hasil hardcode:

| Lokasi | Kemunculan `#4F6EF7` |
|---|---|
| `*.module.css` | **77×** |
| `*.jsx` (inline style) | **41×** |
| **Total** | **118×** |

Sementara `--accent` hanya dipakai **14×** di seluruh `src/`. Design system
menganggap aksen adalah sumbu HSL yang bisa dipersonalisasi; implementasi
mengabaikannya sepenuhnya.

**Hex hardcode lain yang paling sering muncul (JSX):**

| Hex | Jumlah | Peran |
|---|---|---|
| `#4F6EF7` | 41 | primary / link / selected |
| `#EF4444` | 39 | danger / negatif |
| `#22C55E` | 34 | sukses / positif |
| `#DC2626` | 23 | danger (varian lebih gelap) |
| `#F59E0B` | 16 | warning |

## 8.3 Ramp Teks yang Seharusnya 6 Tingkat actuality 3

`--text-3`, `--text-4`, `--text-5` **semuanya** alias ke `var(--muted)`.
Modul CSS menulis `var(--text-3)` di sini, `var(--text-4)` di situ, seolah berbeda —
padahal identik. Frekuensi pemakaian: `--text-4` 107×, `--text-5` 69×,
`--text-3` 50× = 226 pemakaian untuk **satu** nilai warna.

## 8.4 Inkonsistensi Gaya Per Halaman

**Ukuran `.pageTitle`:**

| Halaman | px | Weight | `text-align` |
|---|---|---|---|
| Dompet | 22 | **800** | default |
| Transaksi | 24 | 700 | **`center`** |
| Barang Berkala | 24 | 700 | **`center`** |
| Langganan | 24 | 700 | **`center`** |
| Utang/Piutang | 24 | 700 | **`center`** |
| Investasi | 24 | 700 | **`center`** |
| Kesehatan Keuangan | 24 | 700 | **`center`** |
| Laporan | 24 | 700 | default |
| Kalkulator FIRE | 20 | 700 | default |
| Pengaturan | 22 | **800** | default |
| Bantuan | 20 | **800** | default |

Tiga cluster: 22/800 (Dompet, Pengaturan), 24/700 (7 halaman), 20/700–800 (FIRE, Bantuan).

**Format angka yang bertentangan dalam satu layar:**

| Konteks | Format |
|---|---|
| Dompet — saldo kartu | `fmt` (`1,5jt`) |
| Dompet — ringkasan | `fmtFull` (`Rp1.500.000`) |
| Budget — header section | `fmtFull` |
| Budget — baris kategori | `fmt` |
| Laporan — header section | `fmtFull` |
| Laporan — baris kategori | `fmt` |

**Warna "merah" yang berbeda untuk semantik yang sama:**

| Nilai | Warna | Dipakai di |
|---|---|---|
| Danger (umum) | `#EF4444` | Investments, Settings, Asset |
| Danger (form) | `#DC2626` | Debt, Subscription, Settings |
| Danger (badge) | `#F87171` | badge over-budget / overdue |
| Error (`Field`) | `#EF4444` | semua modal |
| Error (banner) | `#DC2626` | `_general` di 4 modal |

**Teks yang sama, label berbeda:**

| Konsep | Varian |
|---|---|
| Section `wants` | `Ke keinginan` (Budget/Reports/Settings) vs `Ke Ambassador` — tidak ada varian |
| P2P | `P2P` (chip filter Investasi) vs `P2P Lending` (badge + form select) |
| Tipe transaksi | `Pengeluaran` (UI) vs `EXPENSE` (CSV) |
| Ekspor | `Ekspor Data` (heading) vs `Export data` (HelpPage & HelpChat) |
| Nama nav | `Berkala` (sidebar) vs `Barang Berkala` (h1) |
| Nama nav | `Aset` (sidebar) vs `Kesehatan Keuangan` (h1) |
| Tombol tambah | `Tambah Dompet` vs `Tambah Item` vs `Tambah Langganan Pertama` vs `Tambah Pertama` |

## 8.5 `--text-6` Bukan Warna Teks

`--text-6: var(--border)` — dipakai 16× sebagai **warna pemisah** (`" / "` pada
`fmt(spent) / fmt(total)`), bukan teks. Nama tokennya menyesatkan.

## 8.6 Variabel yang Tidak Pernah Dideklarasikan

| Var | Dipakai di | Dampak |
|---|---|---|
| `--amount-income` | `AmountText` | Selalu fallback `#16A34A` |
| `--amount-expense` | `AmountText` | Selalu fallback `#DC2626` |
| `--amount-transfer` | `AmountText` | Selalu fallback `#4F46E5` |
| `--bg-hover` | `SettingsPage` | Selalu fallback `rgba(0,0,0,0.03 / 0.06 / 0.02)` |
| `--od-cols` | `.od-grid` | Selalu fallback `3` |
| `--od-gap` | semua `.od-*` | Selalu fallback `8px`/`12px` |

Tidak declares, tidak ada test, tidak ada dokumentasi.

## 8.7 Toast Tidak Mengikuti Dark Mode

`appToast` memakai `background: '#1E293B'; color: '#F1F5F9'` — **hex yang sama di kedua
tema**. Toast gelap di atas surface gelap `#131d2e` kehilangan kontras.

Selain itu: `z-index: 9999` vs FAB HelpChat `9998` di **posisi yang sama**
(`bottom: 24; right: 24`) → toast menutupi FAB.

Dan tidak ada `role="status"` / `aria-live`, sehingga screen reader tidak
mengumumkan.

## 8.8 `categoryId` Hardcode

| Lokasi | Nilai |
|---|---|
| `TxFormModal.jsx:33` | `categoryId: initial?.categoryId \|\| 'c1'` |
| `subscriptionHelpers.js` `buildSubscriptionTransaction` | `categoryId: 'c10'` |
| `investmentHelpers.js` (beli) | `categoryId: 'c13'` |
| `investmentHelpers.js` (jual) | `categoryId: 'c17'` |

Bila user menghapus kategori tersebut lewat Pengaturan, transaksi yang dibuat
otomatis menunjuk kategori yang tidak ada. Kategori `c1` = `Makanan & Minum` —
kategori **pertama** dijadikan default untuk **semua** transaksi expense tanpa
kategori terpilih.

## 8.9 `PieChart` — Separator Putih di Dark Mode

```jsx
<path fill={slice.color} stroke="white" strokeWidth="2" />
```

`white` hardcode. Di dark mode (`--surface: #131d2e`) garis pemisah antar-segmen
menjadi **seam putih terang** yang tidak menyatu dengan permukaan.

## 8.10 `RESET` vs `Delete` — Dua Instruksi yang Bertentangan

| Sumber | Instruksi |
|---|---|
| `HelpChat.jsx` FAQ #9 | `…klik "Reset Data" → ketik "RESET" untuk konfirmasi.` |
| `ResetConfirmModal.jsx:26` | `canConfirm = safetyInput === 'Delete' && !loading` |

User yang mengikuti instruksi HelpChat akan **mengetik kata yang salah** dan tidak
bisa mengonfirmasi. Bandingkan juga `HelpPage` topik `⚙️ Pengaturan` yang tidak
menyebut kata kuncinya sama sekali.

## 8.11 `aria-label` berbahasa Inggris

UI 100% Bahasa Indonesia, tapi:

| Lokasi | Nilai |
|---|---|
| `Modal.jsx` | `aria-label="Close"` |
| `Sidebar.jsx` | `title`/`aria-label` = `Expand sidebar` / `Collapse sidebar` |
| `WalletFormModal` | `aria-label="Select color {hex}"` |
| `SectionEditModal` | `aria-label="Color {hex}"` |
| `SettingsPage` | `aria-label="Warna {hex}"` (Indonesi ✅) |

Bandingkan HelpChat `aria-label="Tutup bantuan"` dan tombol back `aria-label="Kembali"`
— semuanya Indonesia.

## 8.12 Dropdown Mobile — Ikon Salah

Item `Bantuan` di dropdown avatar-mobile menavigasi ke `help` tapi merender
`NavIcon name="settings"` (gear). Ikon yang tepat (`help-circle`) **tidak ada** di
peta `NavIcon` — HelpChat memakai SVG inline sendiri.

## 8.13 Label Sidebar Tidak Terencepuh

| Yang ditampilkan | Yang sebenarnya |
|---|---|
| `Berkala` | `Barang Berkala` |
| `Aset` | `Kesehatan Keuangan` |
| `Utang/Piutang` | `Utang/Piutang` ✅ |

Selain itu `Periode Aktif` di footer Sidebar menampilkan **bulan kalender berjalan**
(`toLocaleDateString`), **tidak terkait** dengan `cycleStart` / `periodMode` /
`customRanges` yang dipakai seluruh halaman Budget & Laporan.

## 8.14 `DataMigrator` — Render-Phase Side Effect

`DataMigrator.jsx:17,27`:

```jsx
const raw = localStorage.getItem(STORAGE_KEY);   // baca saat render
if (!raw) { onComplete(); return null; }         // panggil callback saat render
```

Memanggil `setState` pada parent **selama render** adalah anti-pattern React.
Selain itu `onClose` (`Lewati` / ✕ / Escape) **tidak di-gate** saat `migrating` —
user bisa membatalkan di tengah proses.

## 8.15 Props & CSS Mati

| Item | Lokasi | Status |
|---|---|---|
| `StatCard` menerima prop `icon` | `Dashboard.jsx` | JSDoc ada, tidak dirender |
| `Calendar` menerima prop `wallets` | `Dashboard.jsx` | sudah dihapus dari call site |
| `AssetPage` menerima prop `setPage` | `App.jsx` | sudah dihapus dari call site |
| `ReportsPage` menerima prop `wallets` | `App.jsx` | sudah dihapus dari call site |
| `ReportsPage` state `viewMode` | `ReportsPage.jsx` | mati |
| `SettingsPage` state `walletImportData` | `SettingsPage.jsx` | mati |
| `.sectionLeft` dipakai di header kartu amortisasi Budget | `BudgetPage.jsx` | **class tidak ada** di module |
| `.emptyState/.emptyIcon/.emptyTitle/.emptyDesc` | `AssetPage.module.css:318-343` | CSS mati (empty state Aset Tetap pakai inline style) |
| `SectionPill.jsx` | `components/ui/` | komponen mati (hanya dipakai test) |
| `--section-pill-*` | `tokens.css` | hanya dipakai komponen mati |
| `--tx-badge-*` | `tokens.css` | dideklarasikan di `:root`, tapi `TxBadge` punya fallback sendiri |
| `@keyframes countUp` | `App.css` | tidak pernah dipakai |
| `@keyframes slideInRight` | `App.css` | tidak pernah dipakai |
| `@keyframes fadeInUp` di `App.css` | `App.css` | mati — digantikan salinan per-module |
| `--header-h: 64px` | `tokens.css` | tidak dipakai (tidak ada topbar desktop) |
| `getOverdueSubscriptions` | `subscriptionHelpers.js` | export tidak terpakai |
| `--bg-hover` | 3 tempat | tidak dideklarasikan |

## 8.16 Aksi Transaksi Tidak Bisa Dicapai di Mobile

`TransactionsPage.module.css` `≤768px`:

```css
.txActions        { display: none; }
.txActionsVisible { display: flex; }
```

Desktop: aksi tampil saat baris diekspansi. Mobile: `display: none` **dan** tidak ada
aturan yang membuatnya otomatis terlihat — jadi user harus tap baris dulu. Tidak
seperti halaman lain yang tetap menampilkan aksi di mobile.

## 8.17 Halaman Langganan Tanpa Test

`src/utils/subscriptionHelpers.js` (9 export, 183 baris) dan
`SubscriptionPage.jsx` (296 baris) **tidak punya test file apa pun**. Ini satu-satunya
helper domain tanpa coverage, dan halamannya masih untracked di git.

`getOverdueSubscriptions` diekspor tapi tidak dipakai — test yang meng-abort persis
menangkap export mati seperti ini.

## 8.18 Hapus Tidak Tersedia di Kartu

| Halaman | Tombol hapus di kartu? |
|---|---|
| Dompet | ✅ `aria-label="Delete wallet"` |
| Langganan | ❌ hanya Edit + toggle |
| Utang/Piutang | ❌ hanya Edit |
| Investasi | ❌ hanya Edit + Beli/Jual/Nilai |
| Barang Berkala | ❌ hanya Edit + toggle + Sudah Beli |

Pengguna harus: Edit → scroll ke bawah → klik Hapus → klik lagi.

## 8.19 `PayModal` — Dua Risiko

1. **Checkbox default `true`.** `Update tanggal jatuh tempo berikutnya` tercentang
   sejak awal. Membayar langganan yang **belum** jatuh tempo akan mendorong tanggal
   jatuh tempo secara diam-diam.
2. **Nol validasi.** `handleSubmit` hanya `preventDefault` lalu `onConfirm`. Tanpa dompet
   (`walletId: ''`) maupun tanggal lampau tetap terkirim.

## 8.20 Model Bunga Utang Tidak Konsisten

| Tempat | Metode |
|---|---|
| `Jadwal Amortisasi` (kartu) | `generateAmortizationSchedule` — anuitas **sejati** |
| `PaymentModal` tulis (`:77-84`) | bunga **flat** atas sisa pokok |

```js
const monthlyRate = (debt.interestRate || 0) / 100 / 12;
const interestPart = Math.round(debt.remainingAmount * monthlyRate);
const principalPart = Math.max(0, paymentData.amount - interestPart);
```

Tabel yang ditampilkan dan angka yang disimpan **tidak berasal dari perhitungan yang
sama**. `principalPart` diturunkan dari angka yang diketik user, bukan dibaca dari
baris jadwal.

## 8.21 Routing Validasi Berbasis Substring

Delapan modal memetakan pesan validator ke field dengan `error.includes('…')`.
Mengubah teks validator = pesan mendarat di field yang salah, **tanpa error
build dan tanpa test failure**.

Tabel lengkap mapping ada di Part 6.7.10, 6.8.9, 6.8.10, 6.8.11, 6.9.9, 6.7.11.

## 8.22 Dua Warna Error yang Bertentangan

| Konteks | Warna |
|---|---|
| `Field` — error inline di bawah input | `#EF4444` |
| Banner `_general` di modal | `#DC2626` |
| Error import slot di Pengaturan | `#F87171` |

Tiga warna untuk satu semantik. Lihat juga `InvestmentFormModal`: pesan
`Bunga tidak boleh negatif` jatuh ke `_general` di **bawah** modal karena tidak
mengandung `'Nama'` maupun `'aset'` — bukan di sebelah input `Bunga per Tahun (%)`
yang dirujuknya.

## 8.23 `PeriodModal` — 13 Chip vs `CycleSettingModal` — 11 Chip

Dua UI untuk **kontrol yang sama** (tanggal mulai siklus) dengan opsi berbeda:

| Lokasi | Opsi |
|---|---|
| `PeriodModal` (Budget) | `[1, 5, 10, 15, 20, 21, 22, 23, 24, 25, 26, 27, 28]` — **13** |
| `CycleSettingModal` (Laporan) | `[1, 5, 10, 15, 20, 23, 24, 25, 26, 27, 28]` — **11** |

Hanya `PeriodModal` yang punya blok `Sesuaikan hari libur`. Dua komponen
`generateRecommendations` / `isHoliday()` yang sama, dua entry point berbeda.

## 8.24 Deposito Tidak Bisa Di-Revaluasi Manual

Tombol `Nilai` (`UpdateValueModal`) disembunyikan untuk `assetType === 'deposito'`
karena nilainya auto-accrued. Konsekuensi: **nilai pasar deposito yang turun (SBR
jatuh tempo, suku bunga turun) tidak bisa dicatat manual** — satu-satunya jalan adalah
menghapus dan membuat entri baru.

## 8.25 `ReportsPage` Menerima Prop yang Tidak Dipakai

`App.jsx` mengirim `salaryAdjust` ke `ReportsPage`, tapi komponen **tidak pernah
mendeklarasikan atau memakainya**. `getPeriodRange(period, cycleStart)` selalu
dipanggil dengan 2 argumen — Penyesuaian hari libur yang aktif di Budget **tidak
berdampak** pada perhitungan periode Laporan.

## 8.26 `<br />` yang Hilang di Blok Perbandingan Laporan

Tiga baris pada blok `💡 Perbandingan`, tapi `<br />` hanya ada setelah baris 1 dan
setelah baris 3. **Baris 2 dan 3 render menyatu dalam satu baris.**

## 8.27 Debounce FIRE Ter-reset Tiap Render

`FirePage.jsx:57` — `useEffect` debounce 500ms dengan dependency array yang memuat
`onSaveFireSettings`, sedangkan `App.jsx:1125` **tidak mememoize** callback tersebut.
Timer ter-reset setiap kali `App` render → auto-save tidak pernah menyelesaikakan
selama user masih mengetik.

## 8.28 `savingsRate` di FirePage = Alokasi FIRE

`generateRecommendations(…, savingsRate, …)` diberi `allocation.fire`
(persentase alokasi FIRE), bukan tingkat tabungan aktual. Rekomendasi #1 dan #2
menjadi membingungkan:

```
Alokasi FIRE Anda hanya 25%. Tingkatkan ke minimal 20-30% …
```
(`25%` "hanya" padahal sudah di atas batas minimum yang disebut)

## 8.29 Tidak Ada Kontrol Tema di Pengaturan

`HelpPage` topik `⚙️ Pengaturan` langkah 4 menulis
`Ganti tema: Dark Mode atau Light Mode.` — **tidak ada kontrol seperti itu di
halaman Pengaturan.**

Tema hanya dapat diubah dari:
1. Footer Sidebar (desktop)
2. Dropdown avatar mobile

`SettingsPage` menerima prop `preferences` (yang berisi `darkMode`) tapi **tidak
menerima setter-nya** dan tidak merender kontrol apa pun.

## 8.30 Impor CSV — Tiga Pemanggilan Terpisah, Tanpa Rollback

`handleCsvImport` memicu `onImportData` **tiga kali** (dompet → transaksi → budget).
Kegagalan di langkah 2/3 meninggalkan langkah sebelumnya sudah diterapkan. Blok
"rollback" di `App.jsx:1187-1192` dan `:1234-1241` **tidak pernah terpicu** — React
setter tidak melempar exception, jadi cabang itu teater.

## 8.31 Cabang `_csvImport` di `ImportConfirmModal` adalah Dead Code

`showImportConfirm` hanya di-set oleh `handleFileSelect` (jalur JSON/ZIP), yang tidak
pernah menyetel `_csvImport`. Importer CSV 3-slot melewati modal ini sepenuhnya.
Semua teks `isCsvImport` (bagian (a)) tidak pernah tampil.

## 8.32 `HelpChat` — Konten Tidak Sinkron dengan UI

| # | Masalah |
|---|---|
| 7 | `Cara export data` menulis `scroll ke bagian "Export Data"` — heading sebenarnya `Ekspor Data` |
| 8 | `Cara ganti tema` menyebut `sidebar bawah` dan `pojok kanan atas` — benar, tapi tidak disebut di halaman Pengaturan mana pun |
| 9 | `Cara reset data` menyuruh ketik `RESET` — lihat Part 8.10 |
| 6 | `3 skenario` cocok dengan chart, tapi menyebut asumsi yang tidak berlabel |
| #4 | menyebut `Bunga Anuitas` — UI sebenarnya `Pakai Bunga (Anuitas)` |
| #2 | menyebut `klik "Edit" di setiap seksi` ✅ benar |

## 8.33 HelpPage FIRE — `safe withdrawal rate` Tidak Ada

Langkah 3 topik `🔥 FIRE Calculator`:
`Atur asumsi: inflasi, return investasi, safe withdrawal rate.`

Halaman FIRE tidak punya kontrol bernama `safe withdrawal rate`. Yang ada:
`Alokasi Pendapatan` (Pokok/Hiburan/FIRE/Emas) dan `Asumsi Pasar`
(Return Investasi Pra-Pensiun, Kenaikan Gaji Tahunan, Estimasi Inflasi,
Return Konservatif Pasca-Pensiun).

## 8.34 Cakupan Halaman Tidak Lengkap di Mobile

Halaman yang bisa dijangkau di ≤768px:

| Sumber chrome | Halaman |
|---|---|
| Bottom nav (4) | `dashboard`, `tx`, `report`, `settings` |
| Dropdown (6) | `wallet`, `budget`, `recurring`, `subscription`, `debt`, `invest` |
| Dropdown | `help` |
| Dashboard quick menu | `asset`, `fire` (mobile only) |
| **Tidak terjangkau** | **`asset`** dan **`fire`** — menu Dashboard yang memuatnya `display:none` di ≥769px |

Desktop lebih lucky: `Settings → Alat Keuangan` menyediakan `fire`, dan sidebar
memakai `asset`. Di mobile, `asset` dan `fire` **hanya** lewat quick menu Dashboard.

## 8.35 Klik-Ganda Hapus Tanpa Batal

Pola di 5 modal (`DebtFormModal`, `InvestmentFormModal`, `FixedAssetFormModal`,
`SubscriptionFormModal`, `SectionEditModal`) mengubah label tombol jadi
`Yakin hapus?` — dan **tidak ada cara membatalkan** selain menutup modal. Tidak ada
timeout, tidak ada `Escape`-reset, tidak ada dialog. Dua variasi label:
`Yakin hapus?` vs `Yakin hapus aset ini?`.

## 8.36 Responsive yang Tidak Lengkap

| Halaman | Tidak ada aturan mobile untuk |
|---|---|
| Kesehatan Keuangan | `.cardTitleRow` / `.addAssetBtn`, seluruh `.fixedAsset*`, `.rekom*`, semua `.badge*`, `.pageTitle` |
| Laporan | `.headerActions`, grid 3 kolom kartu amortikasi (inline style), `.catList` padding |
| FIRE | `.pageHeader`, `.backBtn`, `.pageTitle`, seluruh `.slider*`, `.recItem*`, `max-width: 900px` |
| Utang/Piutang | `.cardMeta` **tidak punya `flex-wrap`** — baris 5 badge bisa meluber |
| Barang Berkala | `.itemMeta` (tidak wrap), padding `.emptyState` |
| Pengaturan | `.catItem`, `.importSlot`, baris radio export |

## 8.37 `@media` yang Tidak Pernah Terpakai

Blok responsif di `base.css` untuk `.metric-grid` (1180px, 639px), `.goal__grid`
(860px), `.row` (639px) **tidak pernah terpakai** karena tidak ada markup yang memakai
`.metric-grid`, `.goal__grid`, atau `.row`. Lihat Part 1.12.

## 8.38 `DayBarChart` — `max` Nol

Bila `max === 0`, semua `bh = 0` → **tidak ada bar yang dirender** (`bh > 0` guard),
hanya baseline + label tanggal. Tidak ada empty state, tidak ada pesan.

## 8.39 `Infinity hari lagi`

`getDaysUntilDue(nextDueDate)` mengembalikan `Infinity` bila `nextDueDate` falsy.
Badge jatuh tempo di Langganan memanggil `getDueLabel()` tanpa guard, sehingga
langganan tanpa tanggal jatuh tempo merender literal:
```
INFINITY HARI LAGI
```
(uppercase karena `.badge`)

## 8.40 `base.css` Sepenuhnya Tidak Diadopsi

Sudah dijelaskan di Part 1.12. Ringkasnya: `.panel`, `.metric-grid`, `.row-list`,
`.chip`, `.bar`, `.btn`, `.filter-chip`, `.field`, `.empty`, `.skeleton`, `.toast`,
`.error-summary`, `.segmented`, `.callout`, `.status`, `.delta`, `.group-label`,
`.avatar`, `.icon-btn`, dan semua `.od-*` **nol pemakaian di seluruh `src/**/*.jsx`**.

Konsekuensi: `base.css` 394 baris ≈ 80% adalah CSS mati. Yang benar-benar hidup:
reset, `.num`/tabular-nums, `.eyebrow`/`.lead`/`.meta`/`.hint`, `.icon`/`.icon-sm`/
`.icon-xs`, `.sr-only`, `.skip-link`, `prefers-reduced-motion`, dan blok
`@media` yang tidak terpakai.

## 8.41 Komentar yang Tidak Akurat

| Lokasi | Klaim | Kenyataan |
|---|---|---|
| `SubscriptionPage.jsx:50` | "overdue first, then by due date ascending" | Comparator placing **aktif sebelum tidak aktif** lebih dulu, baru `days` menaik |
| `Sidebar.jsx` JSDoc | "5 navigation items" | **11** item |
| `TxFormModal.jsx:8` | — | mengimpor `TODAY` dari `defaults` tetapi memakainya ✅ (benar) |
| `RecurringFormModal.jsx`, `RepurchaseModal.jsx` | — | mengimpor `TODAY` tapi **tidak memakainya** (dead import, lolos lint karena `ignoreRestSiblings`) |

## 8.42 Performa — Tanpa Memoization

| Item | Masalah |
|---|---|
| Laporan & Dashboard | memfilter/menjumlahkan **seluruh** array transaksi tiap render, tanpa `useMemo`. Akan melambat pada data besar. |
| `BudgetPage.jsx:503` | `getAmortizedBySection` dihitung **3× dalam satu `.map()`** |
| `App.jsx:1299-1322`, `:1234-1241` | `apiSetWallets`/`apiSetTransactions`/`apiSetCategories` — namanya seolah route lewat API, tapi kedua cabangnya identik (`setState` biasa) |
| `MultiChip` | `options` & `selected` dihitung inline di parent → referensi baru tiap render |

## 8.43 Inkonsistensi Titel Three Ways

| Halaman | Judul halaman | Label navigasi |
|---|---|---|
| Dashboard | *(sapaan, tanpa h1)* | `Dashboard` |
|FIRE | `Kalkulator FIRE 🔥` | *(tidak ada)* |
| Kesehatan Keuangan | `Kesehatan Keuangan` | `Aset` |
| Barang Berkala | `Barang Berkala` | `Berkala` |
| Bantuan | `Bantuan & Panduan` | *(tidak ada; hanya dropdown mobile)* |

Dashboard adalah **satu-satunya halaman tanpa `<h1>`**.

## 8.44 `monthKey` vs `fmtDate` — Dua Gaya Format Bulan

| Fungsi | Bulan |
|---|---|
| `fmtDate(d)` (`utils/formatters.js`) | **pendek** — `19 Apr 2026` |
| `formatDateID` (Budget, lokal) | **panjang** — `23 Mei 2026` |
| `range.label` (Laporan, `cycleStart > 1`) | **pendek** di awal, **panjang** di akhir — `25 Mar – 24 April 2026` |

Ksometimes format bulan berbeda dalam satu tampilan.

## 8.45 Ringkasan Prioritas Perbaikan

Jika hanya boleh memperbaiki 5 hal, urut dampaknya:

1. **8.1 Font** — semua teks kehilangan font yang dimaksud; 1 baris CSS.
2. **8.2 Warna** — 118 hardcode `#4F6EF7` membatalkan seluruh personalisasi accent; 1 token.
3. **8.10 `RESET` vs `Delete`** — pengguna tidak bisa mereset data; 1 string.
4. **8.29 Kontrol tema** — dokumen ToolbarPub menunjuk kontrol yang tidak ada.
5. **8.34 Cakupan mobile** — `asset` & `fire` tidak terjangkau; 1 item dropdown.

---

# Part 9 — Peta File → Spec

Untuk verifikasi coverage: setiap file UI dipetakan ke bagian dokumen ini.

| File | Baris | Bagian |
|---|---|---|
| `src/index.html` | 42 | 2.9 |
| `src/main.jsx` | 15 | 2.1 |
| `src/App.jsx` | 1603 | 2.1, 2.2, 2.5, 2.6, 3.5, 3.6 |
| `src/App.css` | 224 | 2.1, 2.3, 2.4, 2.7, 2.8, 8.1 |
| `src/styles/tokens.css` | 199 | **Part 1** |
| `src/styles/base.css` | 394 | 1.11, 1.12, 8.37, 8.40 |
| `src/context/ThemeContext.jsx` | 49 | 3.5 |
| `src/context/AuthContext.jsx` | 82 | 2.5, **Part 5** |
| `src/config/firebase.js` | 24 | 2.5 |
| `src/components/Modal/*` | 43 + 80 | **4.1** |
| `src/components/ui/Field.jsx` | 37 | 4.2 |
| `src/components/ui/Input.jsx` | 32 | 4.3 |
| `src/components/ui/Select.jsx` | 35 | 4.3 |
| `src/components/ui/AmountText.jsx` | 47 | 4.4, 8.6 |
| `src/components/ui/TxBadge.jsx` | 51 | 4.5, 8.15 |
| `src/components/ui/ProgressBar.jsx` | 47 | 4.6 |
| `src/components/ui/MultiChip.jsx` | 80 | 4.7 |
| `src/components/ui/CategoryPicker.jsx` | 126 + 204 | 4.8 |
| `src/components/ui/SectionPill.jsx` | 48 | 8.15 (mati) |
| `src/components/ui/WalletIcon.jsx` | 46 | 4.10 |
| `src/components/icons/NavIcon.jsx` | 77 | 4.9 |
| `src/components/charts/PieChart.jsx` | 68 | 4.11.1, 8.9 |
| `src/components/charts/CompareBarChart.jsx` | 80 | 4.11.2 |
| `src/components/charts/MonthCompareBar.jsx` | 66 | 4.11.3 |
| `src/components/charts/DailyBarChart.jsx` | 91 | 4.11.4 |
| `src/components/HelpChat/*` | 155 + 225 | **4.12**, 8.10, 8.32 |
| `src/components/DataMigrator.jsx` | 137 | 4.13, 8.14 |
| `src/components/Sidebar/*` | 264 + 530 | **Part 3.1** |
| `src/pages/Auth/*` | 101+124+80+131 | **Part 5** |
| `src/pages/Dashboard/*` | 556+760+176+71+55+33 | **6.1** |
| `src/pages/Wallet/*` | 227+286+86+99+92 | **6.2** |
| `src/pages/Transactions/*` | 394+542+118 | **6.3** |
| `src/pages/Budget/*` | 584+937+35+218+142+336 | **6.4** |
| `src/pages/Recurring/*` | 301+420+171+92 | **6.5** |
| `src/pages/Subscription/*` | 296+413+142+57 | **6.6**, 8.17 |
| `src/pages/Debt/*` | 369+468+298+198 | **6.7**, 8.20, 8.21 |
| `src/pages/Investment/*` | 356+453+171+115+119+47 | **6.8**, 8.24 |
| `src/pages/Asset/*` | 427+485+204 | **6.9** |
| `src/pages/Reports/*` | 523+362+91 | **6.10**, 8.25, 8.26 |
| `src/pages/Fire/*` | 477+536 | **6.11**, 8.27, 8.28 |
| `src/pages/Settings/*` | 957+447+249+176 | **6.12**, 8.29, 8.30, 8.31 |
| `src/pages/Help/*` | 196+189 | **6.13**, 8.33 |
| `src/utils/formatters.js` | 69 | 0.2 |
| `src/utils/constants.js` | 35 | 6.2.4, 10.2 |
| `src/utils/helpers.js` | 363 | 0.2, 6.1.8, 6.4.7, 6.10.1 |
| `src/utils/recurring.js` | 176 | 6.5.5, 6.5.6 |
| `src/utils/subscriptionHelpers.js` | 183 | 6.6.4, 6.6.10, 6.6.11, 8.17 |
| `src/utils/debtHelpers.js` | 294 | 6.7.4 |
| `src/utils/investmentHelpers.js` | 244 | 6.8.4, 6.8.7 |
| `src/utils/assetHelpers.js` | 131 | 6.9.3, 6.9.8 |
| `src/utils/fireCalculator.js` | 263 | 6.11.3, 6.11.4, 6.11.8, 6.11.9 |
| `src/utils/periodAdjuster.js` | 51 | 6.4.5 |
| `src/data/defaults.js` | 88 | **Part 10** |
| `src/data/holidays.js` | 147 | 6.4.12 (penyesuaian gaji) |
| `src/services/*Validator.js` | 272+60+74+11 | 6.7.10, 6.8.9, 6.9.9, 8.21 |

---

# Part 10 — Data Seed

Nilai default di `src/data/defaults.js` (88 baris) yang dirender saat pertama kali
app dibuka dalam mode lokal.

## 10.1 Enam Dompet

| `id` | Nama | `type` | Saldo | Warna | Catatan |
|---|---|---|---|---|---|
| `w1` | `BCA` | `bank` | `8500000` | `#2563EB` | `7890` |
| `w2` | `GoPay` | `ewallet` | `350000` | `#00AED6` | `''` |
| `w3` | `OVO` | `ewallet` | `125000` | `#4C2A86` | `''` |
| `w4` | `BNI` | `bank` | `2200000` | `#F97316` | `1234` |
| `w5` | `Tunai` | `cash` | `400000` | `#16A34A` | `''` |
| `w6` | `Kredivo` | `paylater` | `-750000` | `#DC2626` | `''` |

Ringkasan yang dihasilkan: Total Saldo Bersih `Rp12.825.000` · Total Aset `Rp11.575.000`
· Total Hutang `Rp-750.000`.

## 10.2 Delapan Belas Kategori

### `needs` — `Kebutuhan` (panduan 50%)

| `id` | Nama | Warna | Ikon |
|---|---|---|---|
| `c1` | `Makanan & Minum` | `#F59E0B` | 🍔 |
| `c2` | `Transport` | `#3B82F6` | 🚗 |
| `c3` | `Utilitas` | `#8B5CF6` | 💡 |
| `c4` | `Kesehatan` | `#EF4444` | 💊 |
| `c5` | `Pendidikan` | `#06B6D4` | 📚 |
| `c6` | `Belanja Bulanan` | `#EC4899` | 🛒 |

### `wants` — `Ke keinginan` (panduan 30%)

| `id` | Nama | Warna | Ikon |
|---|---|---|---|
| `c7` | `Hiburan` | `#F97316` | 🎮 |
| `c8` | `Makan di Luar` | `#EAB308` | 🍽️ |
| `c9` | `Fashion` | `#A855F7` | 👕 |
| `c10` | `Langganan` | `#14B8A6` | 📱 |
| `c11` | `Hobi` | `#64748B` | 🎨 |

### `savings` — `Tabungan` (panduan 20%)

| `id` | Nama | Warna | Ikon |
|---|---|---|---|
| `c12` | `Dana Darurat` | `#22C55E` | 🛡️ |
| `c13` | `Investasi` | `#10B981` | 📈 |
| `c14` | `Dana Pensiun` | `#059669` | 🏖️ |

### `income` — `Pemasukan`

Section keempat yang dipakai data tapi **tidak ada di `BUDGET_SECTIONS`** — jadi
tidak punya label panduan dan tidak bisa dianggarkan.

| `id` | Nama | Warna | Ikon |
|---|---|---|---|
| `c15` | `Gaji` | `#6366F1` | 💰 |
| `c16` | `Freelance` | `#8B5CF6` | 💻 |
| `c17` | `Hasil Investasi` | `#10B981` | 💵 |
| `c18` | `Lainnya` | `#94A3B8` | 📦 |

> Fallback `getCatIcon()` bila kategori tidak punya `icon`: map nama
> (makanan 🍔, transport 🚗, utilitas 💡, kesehatan 💊, pendidikan 📚, belanja 🛒,
> hiburan 🎮, makan di luar 🍽️, fashion 👕, langganan 📱, hobi 🎨, dana darurat 🛡️,
> investasi 📈, dana pensiun 🏖️, gaji 💰, freelance 💻, hasil investasi 💵,
> lainnya 📦) → huruf pertama → `📦`.

## 10.3 Tiga Puluh Empat Transaksi

Dua income + 20 expense April + 2 transfer + 13 baris Maret (untuk perbandingan
laporan). Contoh:

| `id` | Tanggal | Dompet | Tipe | Kategori | Jumlah | Catatan | Tags |
|---|---|---|---|---|---|---|---|
| `t1` | `2026-04-01` | `w1` | income | `c15` | `12000000` | `Gaji April` | `['rutin']` |
| `t2` | `2026-04-05` | `w1` | income | `c16` | `1500000` | `Freelance logo design` | `['freelance']` |
| `t3` | `2026-04-02` | `w1` | expense | `c6` | `850000` | `Belanja bulanan Indomaret` | `['rutin']` |
| `t4` | `2026-04-03` | `w2` | expense | `c1` | `65000` | `Makan siang GoFood` | `['makan']` |
| `t9` | `2026-04-08` | `w1` | expense | `c13` | `1000000` | `Reksa dana bulanan` | `['rutin','investasi']` |
| `t21` | `2026-04-10` | `w1` | transfer | `null` | `200000` | `Top up GoPay` | `[]` → `toWalletId: 'w2'` |
| `t22` | `2026-04-15` | `w1` | transfer | `null` | `100000` | `Penarikan tunai` | `[]` → `toWalletId: 'w5'` |
| `t30` | `2026-03-01` | `w1` | income | `c15` | `12000000` | `Gaji Maret` | `['rutin']` |
| `t41` | `2026-03-28` | `w1` | expense | `c7` | `200000` | `Game Steam` | `['hiburan']` |

> `t30` (gaji Maret `12000000`) dan `t41` (Game Steam `200000`) sengaja ada untuk
> mengisi kolom pembanding "vs bulan lalu" di Laporan.

## 10.4 Budget April 2026

`BUDGETS_INIT` hanya punya satu bulan: `'2026-04'`.

| Field | Nilai |
|---|---|
| `totalIncome` | `12000000` |
| `needs.total` | `6000000` (50%) |
| `wants.total` | `3600000` (30%) |
| `savings.total` | `2400000` (20%) |

**Alokasi per kategori (dalam ribuan):**

| Section | Kategori | Alokasi |
|---|---|---|
| `needs` | `c1` Makanan & Minum | `1500000` |
| | `c2` Transport | `800000` |
| | `c3` Utilitas | `600000` |
| | `c4` Kesehatan | `500000` |
| | `c5` Pendidikan | `1200000` |
| | `c6` Belanja Bulanan | `1400000` |
| `wants` | `c7` Hiburan | `500000` |
| | `c8` Makan di Luar | `1000000` |
| | `c9` Fashion | `800000` |
| | `c10` Langganan | `300000` |
| | `c11` Hobi | `1000000` |
| `savings` | `c12` Dana Darurat | `1000000` |
| | `c13` Investasi | `1000000` |
| | `c14` Dana Pensiun | `400000` |

Tepat pembagian 50/30/20 dari 12 juta — jadi bar distribusi di Budget **tidak
menyimpan** dan legend pct tidak menyala oranye.

---

## Penutup

Dokumen ini menggambarkan **BudgetX sebagaimana adanya**, bukan sebagaimana
seharusnyanya. Bagian 0–7 adalah spesifikasi; bagian 8 adalah daftar yang tidak
boleh ditiru.

Kalau kamu membangun ulang UI dari dokumen ini, tiga hal yang perlu diputuskan
secara sadar, karena kodenya tidak konsisten:

1. **Font** — pakai IBM Plex (sesuai `index.html` + `tokens.css`) atau Plus Jakarta
   Sans (sesuai `App.css`)? Pertanyaan 8.1.
2. **Aksen** — cyan `hsl(199 88% 42%)` dari `tokens.css`, atau indigo `#4F6EF7` yang
   dipakai 118×? Pertanyaan 8.2.
3. **Confirm hapus** — pola mana yang jadi kanon: `window.confirm`, klik-ganda, atau
   ketik kata sandi? Pertanyaan 7.6.

Dokumen terkait: `FUNCTIONAL_SPECIFICATION.md` · `TECHNICAL_SPECIFICATION.md` ·
`USER_GUIDE.md` · `AGENTS.md`
