import { useState } from 'react';
import NavIcon from '../icons/NavIcon';

/**
 * HelpChat — canned-answers help bubble.
 *
 * Rule-based, not an AI: FAQ_DATA below is a fixed list, there is no free-text
 * input, and nothing is sent anywhere. Answers are chosen from the buttons.
 *
 * Styled with the design system's own primitives — a circular `.iconBtn`
 * launcher and a `.modal` sheet — rather than the pre-revamp custom CSS, so it
 * picks up density and radius automatically.
 */
const FAQ_DATA = [
  {
    q: 'Bagaimana cara menambah transaksi?',
    a: 'Buka tab Transaksi lalu tekan tombol Tambah di kanan atas. Isi tanggal, dompet, kategori, dan nominal, lalu simpan.',
  },
  {
    q: 'Kenapa saldo dompet saya berubah sendiri?',
    a: 'Setiap transaksi otomatis menyesuaikan saldo dompet yang terkait, termasuk transfer antar dompet.',
  },
  {
    q: 'Bagaimana cara mengatur budget?',
    a: 'Di halaman Budget, tentukan Total Pemasukan lebih dulu, lalu alokasikan ke Kebutuhan, Keinginan, dan Tabungan.',
  },
  {
    q: 'Apa itu siklus budget?',
    a: 'Siklus memindahkan awal bulan ke tanggal gajian. Aktifkan Penyesuaian Hari Libur agar tanggal gajian otomatis digeser ke hari kerja.',
  },
  {
    q: 'Bagaimana cara mencatat utang?',
    a: 'Di Utang/Piutang, pilih tipe Utang atau Piutang, isi pihak dan nominal. Pembayaran bisa dicatat bertahap lewat tombol Bayar.',
  },
  {
    q: 'Bagaimana cara mencatat investasi?',
    a: 'Di Investasi, buat aset lalu catat pembelian dan penjualan. Untuk deposito, isi bunga dan jatuh tempo agar nilai diperbarui otomatis.',
  },
  {
    q: 'Bisakah data saya disinkronkan antar perangkat?',
    a: 'Bisa, jika kamu sudah masuk dengan akun. Data disimpan di cloud dan mengikuti akun tersebut.',
  },
  {
    q: 'Bagaimana cara backup atau export data?',
    a: 'Di Pengaturan, pilih Ekspor Data untuk mengunduh cadangan JSON atau ZIP berisi CSV per koleksi.',
  },
  {
    q: 'Bagaimana cara mengimpor data?',
    a: 'Di Pengaturan, gunakan Impor Cadangan dan pilih file JSON atau ZIP hasil ekspor sebelumnya. Ada mode Replace dan Append.',
  },
  {
    q: 'Bagaimana cara mereset semua data?',
    a: 'Di Pengaturan, bagian Reset Data. Kamu akan diminta mengetik Delete untuk mengonfirmasi — ini demi keamanan.',
  },
];

export default function HelpChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);

  const handleOpen = () => {
    setOpen(true);
    if (!messages) {
      setMessages([
        { type: 'bot', text: 'Halo! Pilih topik yang ingin kamu ketahui.' },
      ]);
    }
  };

  const pick = (item) => {
    setMessages((prev) => [
      ...(prev || []),
      { type: 'user', text: item.q },
      { type: 'bot', text: item.a },
    ]);
  };

  return (
    <>
      <button
        className="iconBtn helpLauncher"
        type="button"
        onClick={handleOpen}
        aria-label="Bantuan"
        style={{
          position: 'fixed',
          right: 'var(--s5)',
          // Clear the mobile tab bar; at desktop width there is no tab bar and
          // --tabbar-h collapses to 0 via the media query in App.css.
          bottom: 'calc(var(--tabbar-h) + var(--s3) + env(safe-area-inset-bottom, 0px))',
          background: 'var(--blue-fill)',
          color: 'var(--accent-on)',
          boxShadow: 'var(--elev-2)',
          zIndex: 35,
        }}
      >
        <NavIcon name="info" size={20} />
      </button>

      {open && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Bantuan"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modalHead">
              <span className="modalTitle">Bantuan</span>
              <button
                className="iconBtn"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
              >
                <NavIcon name="close" size={18} />
              </button>
            </div>
            <div className="modalBody" style={{ display: 'grid', gap: 'var(--s3)' }}>
              {(messages || []).map((m, i) => (
                <div
                  key={i}
                  style={{
                    justifySelf: m.type === 'user' ? 'end' : 'start',
                    maxWidth: '86%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-lg)',
                    background: m.type === 'user' ? 'var(--blue-fill)' : 'var(--fill-quaternary)',
                    color: m.type === 'user' ? '#fff' : 'var(--label)',
                    fontSize: 'var(--t-footnote)',
                    lineHeight: 1.4,
                  }}
                >
                  {m.text}
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: 'grid', gap: 6 }}>
                {FAQ_DATA.map((f) => (
                  <button
                    key={f.q}
                    className="btnSmallGhost"
                    type="button"
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    onClick={() => pick(f)}
                  >
                    {f.q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
