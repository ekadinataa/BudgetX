import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WalletCard from '../../pages/Wallet/WalletCard';
import { fmtFull } from '../../utils/formatters';

const wallet = { id: 'w1', name: 'Kartu Uji', type: 'credit', balance: -400, creditLimit: 1000, heldAmount: 100, color: '#2563eb', note: '7890' };
const props = extra => ({ wallet, transactions: [], onEdit: vi.fn(), onDelete: vi.fn(), ...extra });
const money = value => fmtFull(value).replace(/\s/g, ' ');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 25, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('compact Open Design wallet cards', () => {
  it('separates the icon/actions, identity, signed balance and inline monthly flow', () => {
    const { container } = render(<WalletCard {...props()} />);
    const card = screen.getByRole('article', { name: 'Kartu Uji' });
    expect(within(card).getByRole('heading', { name: 'Kartu Uji' })).toBeInTheDocument();
    expect(card.querySelector('.walletCardHeader')).not.toContainElement(card.querySelector('.walletName'));
    expect(card.querySelector('.walletIcon svg')).toHaveAttribute('aria-hidden', 'true');
    expect(card.querySelector('.walletBalance')).toHaveTextContent('-Rp400');
    expect(card.querySelector('.walletBalance')).toHaveClass('walletBalanceNegative');
    expect(card.querySelector('.walletType')).toHaveTextContent('Kartu Kredit · 7890');
    expect(card.querySelector('footer')).toHaveAttribute('aria-label', 'Arus kas Okt');
    expect(card.querySelector('footer')).toHaveTextContent('Masuk Rp0Keluar Rp0');
    expect(container.querySelector('.walletCreditMetrics')).toBeNull();
  });

  it.each(['credit', 'paylater'])('opens read-only %s metrics and returns focus on dismissal', type => {
    const p = props({ wallet: { ...wallet, type } });
    const original = JSON.stringify(p.wallet);
    render(<WalletCard {...p} />);
    const trigger = screen.getByRole('button', { name: 'Rincian kredit Kartu Uji' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Rincian kredit — Kartu Uji' });
    for (const [label, value] of [['Saldo tercatat', -400], ['Plafon', 1000], ['Outstanding', 400], ['Limit tersedia', 500], ['Hold', 100]]) {
      expect(within(within(dialog).getByText(label).parentElement).getByText(money(value))).toBeInTheDocument();
    }
    expect(dialog).toHaveTextContent('Plafon bukan saldo dompet.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(JSON.stringify(p.wallet)).toBe(original);
    expect(p.onEdit).not.toHaveBeenCalled();
    expect(p.onDelete).not.toHaveBeenCalled();
  });

  it('updates an already-open credit dialog from the latest wallet props', () => {
    const p = props();
    const view = render(<WalletCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rincian kredit Kartu Uji' }));
    view.rerender(<WalletCard {...p} wallet={{ ...wallet, balance: -600, heldAmount: 200 }} />);
    const dialog = screen.getByRole('dialog');
    expect(within(within(dialog).getByText('Limit tersedia').parentElement).getByText(money(200))).toBeInTheDocument();
    expect(within(within(dialog).getByText('Outstanding').parentElement).getByText(money(600))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Selesai' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains edit/delete callbacks without making the whole card a hidden control', () => {
    const p = props();
    render(<WalletCard {...p} />);
    fireEvent.click(screen.getByRole('heading', { name: 'Kartu Uji' }));
    expect(p.onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Kartu Uji' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Kartu Uji' }));
    expect(p.onEdit).toHaveBeenCalledOnce();
    expect(p.onDelete).toHaveBeenCalledOnce();
  });

  it('preserves monthly financial flow exclusions and makes full amounts available', () => {
    const transactions = [
      { walletId: 'w1', date: '2026-10-01', type: 'income', amount: 13500000 },
      { walletId: 'w1', date: '2026-10-02', type: 'expense', amount: 535000 },
      { walletId: 'w1', date: '2026-10-03', type: 'transfer', amount: 200000 },
      { toWalletId: 'w1', walletId: 'w2', date: '2026-10-04', type: 'transfer', amount: 300000 },
      { walletId: 'w1', date: '2026-10-05', type: 'adjustment', amount: -900000 },
      { walletId: 'w1', date: '2026-09-30', type: 'expense', amount: 700000 },
      { walletId: 'w2', date: '2026-10-06', type: 'income', amount: 100000 },
    ];
    const { container } = render(<WalletCard {...props({ transactions })} />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveTextContent('Masuk Rp13,5jt');
    expect(footer).toHaveTextContent('Keluar Rp535rb');
    expect(footer.querySelector('[title^="Pemasukan"]')).toHaveAttribute('title', `Pemasukan Okt: ${fmtFull(13500000)}`);
    expect(footer.querySelector('[title^="Pengeluaran"]')).toHaveAttribute('title', `Pengeluaran Okt: ${fmtFull(535000)}`);
  });

  it.each(['bank', 'cash', 'ewallet'])('does not add credit controls to a %s card', type => {
    render(<WalletCard {...props({ wallet: { ...wallet, type, balance: 0 } })} />);
    expect(screen.queryByRole('button', { name: /Rincian kredit/ })).not.toBeInTheDocument();
    expect(screen.getByText('Rp0', { selector: '.walletBalance' })).not.toHaveClass('walletBalanceNegative');
  });
});
