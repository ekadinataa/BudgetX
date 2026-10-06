import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WalletCard from '../../pages/Wallet/WalletCard';
import WalletFormModal from '../../pages/Wallet/WalletFormModal';
import WalletPage from '../../pages/Wallet/WalletPage';
import { fmtFull } from '../../utils/formatters';

afterEach(cleanup);
const money = (value) => fmtFull(value).replace(/\s/g, ' ');
const wallet = { id: 'credit', name: 'BRI', type: 'credit', balance: -400, color: '#112233', creditLimit: 1000, heldAmount: 100 };
const card = (data) => render(<WalletCard wallet={data} transactions={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
const metric = (label, value) => expect(within(screen.getByText(label).parentElement).getByText(value)).toBeInTheDocument();

describe('credit wallet UI', () => {
  it.each(['local', 'cloud'])('preserves credit fields through %s page edit', async (mode) => {
    const setWallets = vi.fn();
    const update = vi.fn();
    render(<WalletPage wallets={[wallet]} transactions={[]} setWallets={setWallets} onUpdateWallet={mode === 'cloud' ? update : undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit BRI' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hold' }), { target: { value: '200' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Simpan' })));
    if (mode === 'cloud') {
      expect(update).toHaveBeenCalledWith('credit', expect.objectContaining({ creditLimit: 1000, heldAmount: 200, balance: -400 }));
    } else {
      const next = setWallets.mock.calls[0][0]([wallet]);
      expect(next[0]).toEqual({ ...wallet, note: '', heldAmount: 200 });
    }
  });
  it('edits optional credit numbers and previews outstanding and available limit', () => {
    const save = vi.fn();
    render(<WalletFormModal title="Edit Dompet" initial={wallet} onClose={vi.fn()} onSave={save} />);
    expect(screen.getByRole('spinbutton', { name: 'Plafon' })).toHaveValue(1000);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hold' }), { target: { value: '200' } });
    metric('Outstanding', money(400));
    metric('Limit tersedia', money(400));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ balance: -400, creditLimit: 1000, heldAmount: 200 }));
    expect(save.mock.calls[0][0]).not.toHaveProperty('outstanding');
  });
  it('rejects negative optional input and preserves legacy balance when left blank', () => {
    const save = vi.fn();
    render(<WalletFormModal title="Edit Dompet" initial={{ ...wallet, balance: 500, creditLimit: undefined, heldAmount: undefined }} onClose={vi.fn()} onSave={save} />);
    const limit = screen.getByRole('spinbutton', { name: 'Plafon' });
    expect(limit).toHaveValue(null);
    fireEvent.change(limit, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(limit, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(save.mock.calls[0][0].balance).toBe(500);
    expect(save.mock.calls[0][0]).not.toHaveProperty('creditLimit');
  });
  it('keeps bank form free of credit fields', () => {
    render(<WalletFormModal title="Edit Dompet" initial={{ ...wallet, type: 'bank' }} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole('spinbutton', { name: 'Plafon' })).not.toBeInTheDocument();
    expect(screen.getByText('Saldo Awal')).toBeInTheDocument();
  });
  it('renders plafon, outstanding, available limit and hold alongside signed balance', () => {
    card(wallet);
    metric('Plafon', money(1000));
    metric('Outstanding', money(400));
    metric('Limit tersedia', money(500));
    metric('Hold', money(100));
    expect(screen.getByText(money(-400))).toBeInTheDocument();
  });
  it('shows unknown legacy plafon without reinterpreting positive balance', () => {
    card({ ...wallet, balance: 500, creditLimit: undefined, heldAmount: undefined });
    metric('Plafon', 'Belum diatur');
    metric('Limit tersedia', 'Belum diatur');
    metric('Outstanding', money(0));
    expect(screen.getByText(money(500))).toBeInTheDocument();
  });
  it('leaves bank cards unchanged', () => {
    card({ ...wallet, type: 'bank' });
    expect(screen.queryByText('Plafon')).not.toBeInTheDocument();
    expect(screen.getByText(money(-400))).toBeInTheDocument();
  });
});
