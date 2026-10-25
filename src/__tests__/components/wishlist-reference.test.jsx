import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WishlistPage from '../../pages/Wishlist/WishlistPage';
const stamp = '2026-10-01T00:00:00.000Z';
const group = (id, title, targetBudget, price) => ({ id, title, targetBudget, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp, items: price ? [{ id: `${id}-item`, groupId: id, name: 'Monitor', price, marketplaceName: '', productUrl: '', priority: 'medium', createdAt: stamp, updatedAt: stamp }] : [] });
afterEach(cleanup);

it('matches the reference hierarchy with three accurate overview cards and compact whole-card group navigation', () => {
  const groups = [group('g1', 'Ruang Kerja', 1000000, 100000), group('g2', 'Rumah', 2000000, 250000)];
  render(<WishlistPage wishlistGroups={groups} />);
  expect(screen.getByText('Rencanakan keinginan, tentukan prioritas.')).toBeInTheDocument();
  const overview = screen.getByRole('region', { name: 'Ringkasan wishlist' });
  expect(within(overview).getByText('Kelompok Wishlist').closest('dl')).toHaveTextContent('2');
  expect(within(overview).getByText('Target Dana').closest('dl')).toHaveTextContent('Rp3.000.000');
  expect(within(overview).getByText('Total Harga Item').closest('dl')).toHaveTextContent('Rp350.000');
  expect(within(overview).getByText('Estimasi pembelian, bukan pengeluaran')).toBeInTheDocument();
  const card = screen.getByRole('button', { name: 'Buka Ruang Kerja' });
  expect(card).toHaveClass('wishlistCard');
  expect(within(card).getByText('1 item')).toBeInTheDocument();
  expect(within(card).getByText('Total harga')).toBeInTheDocument();
  expect(within(card).getByText('Rp100.000')).toBeInTheDocument();
  expect(within(card).getByText('Target dana')).toBeInTheDocument();
  expect(within(card).getByText('Rp1.000.000')).toBeInTheDocument();
  expect(card.querySelector('svg')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit wishlist Ruang Kerja' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Hapus wishlist Ruang Kerja' })).not.toBeInTheDocument();
  expect(screen.queryByText('Tanggal Target')).not.toBeInTheDocument();
  expect(screen.getByText('Target dana berlaku per kelompok. Wishlist tidak mengurangi saldo dompet.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Buat Wishlist' }).querySelector('svg')).not.toBeNull();
  fireEvent.click(card);
  const dialog = screen.getByRole('dialog', { name: 'Ruang Kerja' });
  expect(within(dialog).getByRole('button', { name: 'Edit wishlist Ruang Kerja' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus wishlist Ruang Kerja' }));
  expect(screen.getByRole('dialog', { name: 'Hapus Wishlist?' })).toHaveTextContent('1 item');
});

it('does not display authoritative zero overview totals when the listener is loading or failed', () => {
  const view = render(<WishlistPage loading />);
  expect(screen.queryByRole('region', { name: 'Ringkasan wishlist' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Memuat wishlist');
  view.rerender(<WishlistPage error="Gagal sinkronisasi" onRetry={vi.fn()} />);
  expect(screen.queryByRole('region', { name: 'Ringkasan wishlist' })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Gagal sinkronisasi');
});

it('updates overview totals from authoritative props and keeps the empty state totals visible', () => {
  const view = render(<WishlistPage />);
  const overview = () => screen.getByRole('region', { name: 'Ringkasan wishlist' });
  expect(within(overview()).getByText('Kelompok Wishlist').closest('dl')).toHaveTextContent('0');
  expect(within(overview()).getAllByText('Rp0')).toHaveLength(2);
  view.rerender(<WishlistPage wishlistGroups={[group('g1', 'Kerja', 1000000, 100000)]} />);
  expect(within(overview()).getByText('Target Dana').closest('dl')).toHaveTextContent('Rp1.000.000');
  expect(within(overview()).getByText('Total Harga Item').closest('dl')).toHaveTextContent('Rp100.000');
});
