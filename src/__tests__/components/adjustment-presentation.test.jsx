import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import AmountText from '../../components/ui/AmountText';
import TxBadge from '../../components/ui/TxBadge';
import TransactionsPage from '../../pages/Transactions/TransactionsPage';
import TxCalendar from '../../pages/Transactions/TxCalendar';
import Dashboard from '../../pages/Dashboard/Dashboard';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { email: 'test@budgetx.id' } }) }));

it.each([25000, -25000])('shows adjustments as signed audit entries in calendar and dashboard (%s)', (amount) => {
  const tx = { ...adjustment, amount };
  const calendar = render(<TxCalendar transactions={[tx]} categories={[]} />);
  const calendarRow = screen.getByText(tx.note).closest('.listRow');
  expect(within(calendarRow).getByText('Penyesuaian Saldo')).toBeInTheDocument();
  expect(within(calendarRow).getByText(signedCurrency(amount))).toBeInTheDocument();
  expect(calendar.container.querySelector('.calDot')).toHaveStyle({ background: 'var(--gray)' });
  expect(calendar.container.querySelector('.dateTotals')).toBeEmptyDOMElement();
  calendar.unmount();
  const dashboard = render(<Dashboard wallets={wallets} transactions={[tx]} categories={[]} budgets={{}} setPage={() => {}} onAddTx={() => {}} />);
  const recentRow = screen.getByText(tx.note).closest('.listRow');
  expect(within(recentRow).getByText(/Penyesuaian Saldo/)).toBeInTheDocument();
  expect(within(recentRow).getByText(signedCurrency(amount))).toBeInTheDocument();
  for (const label of ['Pemasukan', 'Pengeluaran']) {
    const card = [...dashboard.container.querySelectorAll('.statCard')].find((el) => el.querySelector('.statLabel').textContent.startsWith(label));
    expect(card.querySelector('.statValue')).toHaveTextContent('Rp0');
  }
});

const date = new Date();
const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const wallets = [{ id: 'w1', name: 'BCA', type: 'bank', balance: 75000 }];
const adjustment = { id: 'a1', date: today, walletId: 'w1', type: 'adjustment', amount: -25000, balanceBefore: 100000, balanceAfter: 75000, note: 'Koreksi saldo rekening', categoryId: null, toWalletId: null, tags: [] };

it('keeps adjustment rows read-only with reason, audit balances and deletion', () => {
  const remove = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<TransactionsPage wallets={wallets} categories={[]} transactions={[adjustment]} onDeleteTransaction={remove} />);
  const row = screen.getByText(adjustment.note).closest('.listRow');
  expect(within(row).queryByRole('button', { name: /Edit transaksi/ })).not.toBeInTheDocument();
  expect(within(row).queryByText('Belum dikategorikan')).not.toBeInTheDocument();
  expect(within(row).getByText(signedCurrency(adjustment.amount))).toBeInTheDocument();
  fireEvent.click(screen.getByText(adjustment.note));
  expect(within(row).getByText(/Saldo sebelum: Rp 100.000/)).toBeInTheDocument();
  expect(within(row).getByText(/Saldo sesudah: Rp 75.000/)).toBeInTheDocument();
  fireEvent.click(within(row).getByRole('button', { name: /Hapus transaksi/ }));
  expect(remove).toHaveBeenCalledWith('a1');
});

it('offers an adjustment filter without including adjustments in income/expense summaries', () => {
  const income = { ...adjustment, id: 'i1', type: 'income', amount: 50000, note: 'Gaji' };
  render(<TransactionsPage wallets={wallets} categories={[]} transactions={[adjustment, income]} />);
  expect(screen.getByText('Rp 50.000', { selector: '.summaryPillValue.amountIn' })).toBeInTheDocument();
  expect(screen.getByText('Rp 0', { selector: '.summaryPillValue:not(.amountIn)' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Penyesuaian Saldo' }));
  expect(screen.queryByText('Gaji')).not.toBeInTheDocument();
  expect(screen.getByText(adjustment.note)).toBeInTheDocument();
});

const signedCurrency = (amount) => `${amount < 0 ? '-' : '+'}Rp ${Math.abs(amount).toLocaleString('id-ID')}`;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([25000, -25000])('labels adjustments separately and renders signed absolute currency (%s)', (amount) => {
  render(<><TxBadge type="adjustment" /><AmountText type="adjustment" amount={amount} /></>);
  expect(screen.getByText('Penyesuaian Saldo')).toBeInTheDocument();
  expect(screen.getByText(signedCurrency(amount))).toBeInTheDocument();
  expect(screen.queryByText('Pengeluaran')).not.toBeInTheDocument();
});
