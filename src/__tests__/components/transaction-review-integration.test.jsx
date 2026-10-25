import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
vi.mock('../../pages/Transactions/TransactionReviewPanel', () => ({ default: ({ reviews = [] }) => <section aria-label="Antrean independen">{reviews.map(row => <p key={row.id}>{row.reason}</p>)}</section> }));
import TransactionsPage from '../../pages/Transactions/TransactionsPage';
afterEach(cleanup);
it('shows the independent review queue even when the transaction date filter has no matches', () => {
  render(<TransactionsPage wallets={[]} transactions={[]} categories={[]} reviewQueue={{ reviews: [{ id: 'review-old', reason: 'Bukti transfer lama perlu konfirmasi' }] }} />);
  expect(screen.getByRole('region', { name: 'Antrean independen' })).toHaveTextContent('Bukti transfer lama perlu konfirmasi');
  expect(screen.getByText('0 transaksi ditemukan')).toBeInTheDocument();
});
