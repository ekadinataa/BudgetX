import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TransactionsPage from '../../pages/Transactions/TransactionsPage';
import TxFormModal from '../../pages/Transactions/TxFormModal';

const wallets = [{ id: 'w1', name: 'Credit', balance: -42 }];
const categories = [{ id: 'c1', name: 'Income Other', section: 'income' }];
const tx = { id: 'mesh', date: '2026-10-07', walletId: 'w1', type: 'expense', amount: 42, note: 'Unresolved email', categoryId: null, category_status: 'unclassified', tags: [] };
afterEach(cleanup);
it('labels unresolved transactions without misclassifying them', () => {
  render(<TransactionsPage wallets={wallets} categories={categories} transactions={[tx]} />);
  expect(screen.getByText('Belum dikategorikan')).toBeInTheDocument();
});
it('keeps an unresolved category empty when saving edits', () => {
  const save = vi.fn();
  render(<TxFormModal wallets={wallets} categories={categories} initial={tx} onSave={save} onClose={() => {}} />);
  fireEvent.click(screen.getByText('Simpan Perubahan'));
  expect(save.mock.calls[0][0].categoryId).toBe('');
});
