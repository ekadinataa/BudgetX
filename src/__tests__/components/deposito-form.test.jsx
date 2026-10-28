import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import InvestmentFormModal from '../../pages/Investment/InvestmentFormModal';
afterEach(cleanup);

it('validates preserved opening fields when metadata changes after a transaction', () => {
  const onSave = vi.fn();
  render(<InvestmentFormModal initial={{ name: 'Uji', assetType: 'deposito', principal: 10000000, depositDate: '2026-10-01', transactions: [{ type: 'buy', date: '2026-10-02', units: 1, pricePerUnit: 1000000 }] }} onClose={() => {}} onSave={onSave} />);
  fireEvent.change(document.querySelectorAll('input[type="date"]')[1], { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(/jatuh tempo tidak boleh sebelum/)).toBeInTheDocument();
});

it('keeps nominal optional for the existing Beli-from-wallet flow', () => {
  const onSave = vi.fn();
  render(<InvestmentFormModal onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByPlaceholderText('cth. BCA Deposito, BBCA, Bitcoin'), { target: { value: 'Baru' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deposito' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tambah', exact: true }));
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('principal');
});

it.each(['0', '-100', '1.5'])('blocks invalid nominal %s before saving', nominal => {
  const onSave = vi.fn();
  render(<InvestmentFormModal initial={{ name: 'Uji', assetType: 'deposito' }} onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Nominal Deposito (Rp)' }), { target: { value: nominal } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(/Nominal deposito harus/)).toBeInTheDocument();
});

it('does not overwrite existing wallet-linked purchase history when editing metadata', () => {
  const onSave = vi.fn();
  const initial = { id: 'old', name: 'Deposito lama', assetType: 'deposito', transactions: [{ id: 'buy', type: 'buy', date: '2026-10-01', units: 1, pricePerUnit: 2000000, totalAmount: 2000000, walletId: 'bank', walletTxId: 'tx' }] };
  render(<InvestmentFormModal initial={initial} onClose={() => {}} onSave={onSave} />);
  expect(screen.getByRole('spinbutton', { name: 'Nominal Deposito (Rp)' })).toHaveValue(2000000);
  expect(screen.getByRole('spinbutton', { name: 'Nominal Deposito (Rp)' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
  expect(onSave).toHaveBeenCalledOnce();
  for (const key of ['principal', 'depositDate', 'transactions']) expect(onSave.mock.calls[0][0]).not.toHaveProperty(key);
});

it('edits the nominal of a deposito without requiring a wallet or creating transactions', () => {
  const onSave = vi.fn();
  render(<InvestmentFormModal initial={{ id: 'inv', name: 'Superbank', assetType: 'deposito', transactions: [] }} onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Nominal Deposito (Rp)' }), { target: { value: '10000000' } });
  fireEvent.change(screen.getByLabelText('Tanggal Penempatan'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ principal: 10000000, depositDate: '2026-10-01' }));
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('transactions');
});
