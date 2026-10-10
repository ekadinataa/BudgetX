import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ user: { uid: 'mock-wallet-user' }, listeners: [] }));
vi.mock('../../config/firebase', () => ({ auth: { currentUser: state.user }, db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn() }));
vi.mock('../../services/firestoreService', () => ({
  initUser: vi.fn(async () => {}),
  subscribeUserData: vi.fn((uid, handlers) => { state.listeners.push(handlers); return vi.fn(); }),
  getBudgets: vi.fn(async () => ({})), getPreferences: vi.fn(async () => ({ page: 'wallet' })),
  getRecurringItems: vi.fn(async () => []), getDebts: vi.fn(async () => []), getInvestments: vi.fn(async () => []),
  getFixedAssets: vi.fn(async () => []), getSubscriptions: vi.fn(async () => []), updatePreferences: vi.fn(), updateWallet: vi.fn(),
}));
import App from '../../App';
import * as api from '../../services/firestoreService';
const wallet = { id: 'w1', name: 'BCA Cloud', type: 'bank', balance: 100, color: '#2563EB', note: '' };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.listeners = []; });
afterEach(cleanup);
async function open() {
  render(<App />);
  await waitFor(() => expect(state.listeners).toHaveLength(1));
  await act(async () => {
    state.listeners[0].wallets([wallet]); state.listeners[0].transactions([]); state.listeners[0].categories([]);
  });
  await screen.findByRole('button', { name: 'Edit BCA Cloud' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit BCA Cloud' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Saldo' }), { target: { value: '150' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Alasan perubahan' }), { target: { value: 'Cocokkan bank' } });
}
it('passes reviewed saldo and reason to cloud and never inserts optimistic wallet/transaction state', async () => {
  await open();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Penyesuaian' })));
  expect(api.updateWallet).toHaveBeenCalledWith('w1', expect.objectContaining({ balance: 150 }), { expectedBalance: 100, reason: 'Cocokkan bank' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  // Server reply alone cannot change a cloud wallet; it needs the authoritative snapshot.
  fireEvent.click(screen.getByRole('button', { name: 'Edit BCA Cloud' }));
  expect(screen.getByRole('spinbutton', { name: 'Saldo' })).toHaveValue(100);
});
it('preserves failed cloud confirmation for review and retry', async () => {
  api.updateWallet.mockRejectedValueOnce(new Error('Saldo dompet berubah. Tinjau ulang saldo.'));
  await open();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Penyesuaian' })));
  expect(screen.getByRole('dialog', { name: 'Konfirmasi Penyesuaian Saldo' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Saldo dompet berubah');
  await act(async () => state.listeners[0].wallets([{ ...wallet, balance: 120 }]));
  expect(screen.getByRole('button', { name: 'Konfirmasi Penyesuaian' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau Ulang Saldo' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Penyesuaian' })));
  expect(api.updateWallet).toHaveBeenLastCalledWith('w1', expect.objectContaining({ balance: 150 }), { expectedBalance: 120, reason: 'Cocokkan bank' });
});
