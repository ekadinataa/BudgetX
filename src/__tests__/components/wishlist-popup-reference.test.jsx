import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WishlistPage from '../../pages/Wishlist/WishlistPage';
import WishlistDialog from '../../pages/Wishlist/WishlistDialog';
const stamp = '2026-10-01T00:00:00.000Z';
const group = (price = 100000) => ({ id: 'g1', title: 'Ruang Kerja', targetBudget: 1000000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: price ? [{ id: 'i1', groupId: 'g1', name: 'Komputer', price, marketplaceName: 'Tokopedia', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp }] : [] });
afterEach(cleanup);

it('matches the detail reference with a comparison panel, aligned item controls and footer group actions', () => {
  render(<WishlistPage wishlistGroups={[group()]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Buka Ruang Kerja' }));
  const dialog = screen.getByRole('dialog', { name: 'Ruang Kerja' });
  const summary = dialog.querySelector('.wishlistDetailSummary');
  expect(summary).not.toBeNull();
  expect(summary).toHaveTextContent('Total harga item');
  expect(summary).toHaveTextContent('Target dana');
  expect(summary).toHaveTextContent('Rp100.000');
  expect(summary).toHaveTextContent('Rp1.000.000');
  const meter = within(dialog).getByRole('meter', { name: 'Perbandingan harga terhadap target dana' });
  expect(meter).toHaveAttribute('aria-valuenow', '10');
  expect(meter).toHaveAttribute('aria-valuetext', expect.stringContaining('bukan dana terkumpul'));
  expect(meter.firstElementChild.style.width).toBe('10%');
  expect(within(dialog).getByText('Sisa dari target')).toBeInTheDocument();
  expect(within(dialog).getByRole('heading', { name: 'Daftar item · 1' })).toBeInTheDocument();
  expect(within(dialog).getByText('Estimasi belum termasuk ongkir. Wishlist tidak memindahkan saldo atau mencatat transaksi.')).toBeInTheDocument();
  expect(within(dialog.querySelector('header')).queryByRole('button', { name: 'Edit wishlist Ruang Kerja' })).not.toBeInTheDocument();
  const footer = dialog.querySelector('footer.wishlistTotals');
  expect(within(footer).getByRole('button', { name: 'Edit wishlist Ruang Kerja' })).toHaveTextContent('Edit Wishlist');
  expect(within(footer).getByRole('button', { name: 'Hapus wishlist Ruang Kerja' })).toHaveTextContent('Hapus');
  expect(footer).toHaveTextContent('Rp100.000');
  expect(within(dialog).getByRole('button', { name: 'Tambah Item' }).querySelector('svg')).not.toBeNull();
});

it.each([[0, 0, 'Sisa dari target'], [1000000, 100, 'Sesuai Target Anggaran'], [2000000, 100, 'Melebihi Anggaran']])('caps the comparison meter safely for item total %i', (price, percent, label) => {
  render(<WishlistPage wishlistGroups={[group(price)]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Buka Ruang Kerja' }));
  const dialog = screen.getByRole('dialog');
  const meter = within(dialog).getByRole('meter');
  expect(meter).toHaveAttribute('aria-valuenow', String(percent));
  expect(meter.firstElementChild.style.width).toBe(`${percent}%`);
  expect(within(dialog).getByText(label)).toBeInTheDocument();
});

it('focuses editor input initially and excludes collapsed schedule fields from the focus trap', () => {
  render(<WishlistDialog title="Editor" onClose={vi.fn()}><input aria-label="Judul" data-autofocus="true" /><button>Simpan</button><details><summary tabIndex={0}>Jadwal target</summary><input aria-label="Tanggal" type="date" /></details></WishlistDialog>);
  expect(screen.getByLabelText('Judul')).toHaveFocus();
  const close = screen.getByRole('button', { name: 'Tutup' });
  close.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(screen.getByText('Jadwal target')).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(close).toHaveFocus();
  const details = screen.getByText('Jadwal target').parentElement;
  details.setAttribute('open', '');
  close.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(screen.getByLabelText('Tanggal')).toHaveFocus();
});
