import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ props: null }));
vi.mock('../../config/firebase', () => ({ auth: null, db: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('../../pages/Investment/InvestmentPage', () => ({ default: props => { state.props = props; return <div>Investasi uji</div>; } }));
import App from '../../App';
const investment = { id: 'deposit', name: 'Deposito Uji', assetType: 'deposito', principal: 10000000, depositDate: '2026-10-01', interestRate: 0, currentValue: 0, transactions: [] };
const wallet = { id: 'bank', name: 'Bank Uji', type: 'bank', balance: 10000000 };
const saved = () => JSON.parse(localStorage.getItem('budgetku_state'));
beforeEach(() => {
  state.props = null; localStorage.clear();
  localStorage.setItem('budgetku_state', JSON.stringify({ page: 'invest', wallets: [wallet], transactions: [], categories: [], budgets: {}, investments: [investment] }));
});
afterEach(() => { cleanup(); localStorage.clear(); });
async function open() {
  render(<App />);
  await waitFor(() => expect(state.props?.investments).toHaveLength(1));
}
it('rejects a local asset type change before updating saved state', async () => {
  await open();
  await act(async () => { await expect(state.props.onUpdateInvestment('deposit', { assetType: 'saham' })).rejects.toThrow(/Jenis aset tidak boleh diubah/); });
  expect(saved().investments).toEqual([investment]);
  expect(saved().transactions).toEqual([]);
  expect(saved().wallets).toEqual([wallet]);
});
it('rejects a local backdated sell before any transaction or holding change', async () => {
  await open();
  await act(async () => {
    await expect(state.props.onRecordSell('deposit', { units: 1, pricePerUnit: 10000000, totalAmount: 10000000, walletId: 'bank', date: '2026-09-30' })).rejects.toThrow(/Unit jual melebihi posisi/);
  });
  expect(saved().investments).toEqual([investment]);
  expect(saved().transactions).toEqual([]);
  expect(saved().wallets).toEqual([wallet]);
});
