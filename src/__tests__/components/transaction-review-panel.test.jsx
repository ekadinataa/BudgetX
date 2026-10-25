import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TransactionReviewPanel from '../../pages/Transactions/TransactionReviewPanel';
import { fmtFull } from '../../utils/formatters';

const receipt = (overrides = {}) => ({
  schemaVersion: 1, id: 'a'.repeat(64), version: 'b'.repeat(16), kind: 'receipt', state: 'pending',
  amount: 100000, fee: 2500, currency: 'IDR', occurredAt: '2026-10-24T10:00:00Z',
  provider: 'Bank Contoh', reason: 'needs_confirmation', error: '', source: null, destination: null,
  choices: [{ action: 'expense', source: 'bank', destination: 'EXTERNAL' }],
  walletOptions: [{ key: 'bank', walletId: 'w1', name: 'Dompet Utama' }], event_id: 'event-1',
  ...overrides,
});
afterEach(cleanup);

it('does not label non-IDR data as rupiah and gives an Indonesian fallback for invalid times', () => {
  render(<TransactionReviewPanel reviews={[receipt({ currency: 'USD', occurredAt: 'not-a-date' })]} onDecision={vi.fn()} />);
  const article = screen.getByRole('article');
  expect(within(article).getByText('Belum diketahui')).toBeInTheDocument();
  expect(within(article).getByText(/Waktu belum diketahui/)).toBeInTheDocument();
  expect(within(article).queryByText(/Rp/)).not.toBeInTheDocument();
});

it('identifies the receipt in its confirmation summary and announces local simulation there', () => {
  const review = receipt();
  render(<TransactionReviewPanel reviews={[review]} localMode onDecision={vi.fn()} />);
  confirmExpense();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Bank Contoh')).toBeInTheDocument();
  expect(within(dialog).getByText('aaaaaaaa')).toBeInTheDocument();
  expect(within(dialog).getByText(/Mode lokal — simulasi/)).toBeInTheDocument();
});

it('requires a fresh explicit choice on every opening and never invents unproposed choices', () => {
  const review = receipt({ choices: undefined });
  const view = render(<TransactionReviewPanel reviews={[review]} onDecision={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  view.rerender(<TransactionReviewPanel reviews={[receipt()]} onDecision={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '0' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Lanjutkan' })).toBeDisabled();
});

it('uses safe Indonesian reason labels, escaped metadata and predictable review article selectors', () => {
  const review = receipt({ provider: '<img src=x onerror=alert(1)>', reason: 'ambiguous_wallet', error: '<script>bad()</script>', amount: null, occurredAt: null, rawEmail: 'ISI EMAIL PRIBADI' });
  const view = render(<TransactionReviewPanel reviews={[review]} localMode onDecision={vi.fn()} />);
  const article = view.container.querySelector(`article[data-review-id="${review.id}"]`);
  expect(article).toBeInTheDocument();
  expect(within(article).getByText(/Dompet belum dapat ditentukan/)).toBeInTheDocument();
  expect(within(article).getByText('<script>bad()</script>')).toBeInTheDocument();
  expect(within(article).getByText('Belum diketahui')).toBeInTheDocument();
  expect(within(article).getByText(/Waktu belum diketahui/)).toBeInTheDocument();
  expect(view.container.querySelector('img, script')).not.toBeInTheDocument();
  expect(screen.queryByText('ISI EMAIL PRIBADI')).not.toBeInTheDocument();
  expect(screen.getByText(/Mode lokal — simulasi/)).toBeInTheDocument();
});

it('does not permit resubmitting an acknowledged revision before the authoritative snapshot arrives', async () => {
  const review = receipt();
  const decide = vi.fn().mockResolvedValue(undefined);
  const view = render(<TransactionReviewPanel reviews={[review]} onDecision={decide} />);
  confirmExpense();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi & Catat' })));
  expect(screen.getByRole('button', { name: 'Tinjau' })).toBeDisabled();
  expect(screen.getByText(/Keputusan terkirim/)).toBeInTheDocument();
  expect(screen.queryByText('Tercatat')).not.toBeInTheDocument();
  view.rerender(<TransactionReviewPanel reviews={[{ ...review, version: 'c'.repeat(16), state: 'approved' }]} onDecision={decide} />);
  expect(screen.getByText('Menunggu pencatatan')).toBeInTheDocument();
  expect(screen.queryByText('Tercatat')).not.toBeInTheDocument();
  view.rerender(<TransactionReviewPanel reviews={[{ ...review, version: 'd'.repeat(16), state: 'posted' }]} onDecision={decide} />);
  fireEvent.click(screen.getByRole('button', { name: /Riwayat/ }));
  expect(screen.getByText('Tercatat')).toBeInTheDocument();
});

it.each([
  ['income', 'EXTERNAL', 'bank', '+Rp 100.000', null],
  ['transfer', 'bank', 'cash', '-Rp 102.500', '+Rp 100.000'],
])('previews known %s wallet deltas including fees in the final confirmation', (action, source, destination, firstDelta, secondDelta) => {
  const review = receipt({ choices: [{ action, source, destination }], walletOptions: [
    { key: 'bank', walletId: 'w1', name: 'Dompet Utama' }, { key: 'cash', walletId: 'w2', name: 'Tunai' },
  ] });
  render(<TransactionReviewPanel reviews={[review]} onDecision={vi.fn()} />);
  confirmExpense();
  const dialog = screen.getByRole('dialog', { name: 'Konfirmasi pencatatan' });
  expect(within(dialog).getByText(firstDelta)).toBeInTheDocument();
  if (secondDelta) expect(within(dialog).getByText(secondDelta)).toBeInTheDocument();
  expect(within(dialog).getByText('Dompet Utama', { selector: 'dt' })).toBeInTheDocument();
  expect(within(dialog).getByText('Rp 2.500')).toBeInTheDocument();
});

it('previews canonical net principal rather than double charging a net-received transfer fee', () => {
  const review = receipt({ amount: 100000, fee: 2500, totalCredit: 97500,
    choices: [{ action: 'transfer', source: 'bank', destination: 'cash' }],
    walletOptions: [{ key: 'bank', walletId: 'w1', name: 'Dompet Utama' }, { key: 'cash', walletId: 'w2', name: 'Tunai' }],
  });
  render(<TransactionReviewPanel reviews={[review]} onDecision={vi.fn()} />);
  confirmExpense();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('-Rp 100.000')).toBeInTheDocument();
  expect(within(dialog).getByText('+Rp 97.500')).toBeInTheDocument();
});

it('requires a separate rejection confirmation and sends null endpoints, preserving a failed dialog', async () => {
  const review = receipt();
  const decide = vi.fn().mockRejectedValueOnce(new Error('Penolakan gagal')).mockResolvedValue(undefined);
  render(<TransactionReviewPanel reviews={[review]} onDecision={decide} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tolak transaksi' }));
  expect(screen.getByRole('dialog', { name: 'Tolak transaksi' })).toBeInTheDocument();
  expect(decide).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ya, Tolak' })));
  expect(decide).toHaveBeenLastCalledWith(review, { action: 'reject', source: null, destination: null });
  expect(screen.getByRole('alert')).toHaveTextContent('Penolakan gagal');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ya, Tolak' })));
  expect(decide).toHaveBeenCalledTimes(2);
});

it('routes blocked receipts to trusted recovery instead of unsafe web retry', () => {
  const review = receipt({ state: 'blocked', event_id: null });
  render(<TransactionReviewPanel reviews={[review]} onDecision={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Tinjau' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
  expect(screen.getByText(/administrator/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Konfirmasi & Catat' })).not.toBeInTheDocument();
});

it('does not offer a second decision after reload for a canonically accepted web revision', () => {
  render(<TransactionReviewPanel reviews={[receipt({ webDecisionAccepted: true })]} onDecision={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Tinjau' })).not.toBeInTheDocument();
  expect(screen.getByText(/administrator/)).toBeInTheDocument();
});

it.each([{ kind: 'delivery' }, { state: 'blocked', event_id: 'already-prepared' }])('never approves or retries delivery or a blocked prepared event: %j', extra => {
  render(<TransactionReviewPanel reviews={[receipt(extra)]} onDecision={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Tinjau' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
  expect(screen.getByText(/Tidak dapat dikonfirmasi dari panel ini/)).toBeInTheDocument();
});

it.each([
  { amount: null }, { amount: '100000' }, { amount: -1 }, { amount: 0 }, { amount: NaN },
  { amount: Number.MAX_SAFE_INTEGER }, { fee: '0' }, { fee: -1 },
  { currency: 'USD' }, { choices: [{ action: 'expense', source: null, destination: 'EXTERNAL' }] },
  { choices: [{ action: 'transfer', source: 'bank', destination: 'unmapped' }] },
])('never offers approval for unsafe financial data even if the backend mirror proposes a choice: %j', extra => {
  render(<TransactionReviewPanel reviews={[receipt(extra)]} onDecision={vi.fn()} />);
  expect(screen.getByText('0 perlu ditinjau')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  expect(screen.getByText(/Tidak ada pilihan pencatatan yang aman/)).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Konfirmasi & Catat' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Lanjutkan' })).not.toBeInTheDocument();
});

it('allows choices when fee is null (zero-fee transfer like BI-FAST)', () => {
  render(<TransactionReviewPanel reviews={[receipt({ fee: null })]} onDecision={vi.fn()} />);
  expect(screen.getByText('1 perlu ditinjau')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  expect(screen.getByRole('combobox')).toBeInTheDocument();
});

it('distinguishes loading and failed fetches from an empty healthy queue and supports retry', () => {
  const retry = vi.fn();
  const view = render(<TransactionReviewPanel loading onRetry={retry} />);
  expect(screen.getByRole('status')).toHaveTextContent('Memuat konfirmasi');
  expect(screen.queryByText('Tidak ada konfirmasi tertunda.')).not.toBeInTheDocument();
  view.rerender(<TransactionReviewPanel error="Antrean gagal dimuat" onRetry={retry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Antrean gagal dimuat');
  expect(screen.queryByText('Tidak ada konfirmasi tertunda.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<TransactionReviewPanel />);
  expect(screen.getByText('Tidak ada konfirmasi tertunda.')).toBeInTheDocument();
});

it('disables cached decisions during loading or an error, including an already open approval', () => {
  const review = receipt();
  const decide = vi.fn();
  const view = render(<TransactionReviewPanel reviews={[review]} loading onDecision={decide} />);
  expect(screen.getByRole('button', { name: 'Tinjau' })).toBeDisabled();
  view.rerender(<TransactionReviewPanel reviews={[review]} onDecision={decide} />);
  confirmExpense();
  view.rerender(<TransactionReviewPanel reviews={[review]} loading onDecision={decide} />);
  expect(screen.getByRole('button', { name: 'Konfirmasi & Catat' })).toBeDisabled();
  view.rerender(<TransactionReviewPanel reviews={[review]} error="Hors ligne" onDecision={decide} />);
  expect(screen.getByRole('button', { name: 'Konfirmasi & Catat' })).toBeDisabled();
});

it.each([{ version: 'c'.repeat(16) }, { state: 'posted' }, { amount: 200000 }, null])('invalidates an open approval when the latest mirror changes or disappears: %j', async change => {
  const review = receipt();
  const decide = vi.fn();
  const view = render(<TransactionReviewPanel reviews={[review]} onDecision={decide} />);
  confirmExpense();
  view.rerender(<TransactionReviewPanel reviews={change ? [{ ...review, ...change }] : []} onDecision={decide} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/Data konfirmasi berubah/);
  const submit = screen.getByRole('button', { name: 'Konfirmasi & Catat' });
  expect(submit).toBeDisabled();
  await act(async () => fireEvent.click(submit));
  expect(decide).not.toHaveBeenCalled();
});

function confirmExpense() {
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Pencatatan transaksi' }), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan' }));
}

it('locks duplicate submissions and closure while awaiting a decision, preserving errors for retry', async () => {
  let reject;
  const decide = vi.fn(() => new Promise((_, fail) => { reject = fail; }));
  render(<TransactionReviewPanel reviews={[receipt()]} onDecision={decide} />);
  confirmExpense();
  const submit = screen.getByRole('button', { name: 'Konfirmasi & Catat' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(decide).toHaveBeenCalledTimes(1);
  expect(submit).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => reject(new Error('Koneksi terputus')));
  expect(screen.getByRole('alert')).toHaveTextContent('Koneksi terputus');
  expect(screen.getByRole('dialog', { name: 'Konfirmasi pencatatan' })).toBeInTheDocument();
  expect(submit).not.toBeDisabled();
  decide.mockResolvedValue(undefined);
  await act(async () => fireEvent.click(submit));
  expect(decide).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Tercatat')).not.toBeInTheDocument();
});

it('requires an explicit backend choice and confirmation before submitting the exact decision', async () => {
  const review = receipt();
  const decide = vi.fn().mockResolvedValue(undefined);
  render(<TransactionReviewPanel reviews={[review]} onDecision={decide} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tinjau' }));
  const dialog = screen.getByRole('dialog', { name: 'Tinjau transaksi' });
  expect(dialog).toHaveFocus();
  const select = within(dialog).getByRole('combobox', { name: 'Pencatatan transaksi' });
  expect(select).toHaveValue('');
  expect(within(dialog).getByRole('button', { name: 'Lanjutkan' })).toBeDisabled();
  expect(within(dialog).getByText(/Biaya/)).toBeInTheDocument();
  fireEvent.change(select, { target: { value: '0' } });
  expect(within(dialog).getByText(/-Rp\s*102.500/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lanjutkan' }));
  expect(decide).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Konfirmasi pencatatan' })).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi & Catat' })));
  expect(decide).toHaveBeenCalledExactlyOnceWith(review, { action: 'expense', source: 'bank', destination: 'EXTERNAL' });
  expect(screen.queryByText('Tercatat')).not.toBeInTheDocument();
});


it('keeps held receipts visible with explicit non-posted status and optional history', () => {
  render(<TransactionReviewPanel reviews={[
    receipt(), receipt({ id: 'c'.repeat(64), state: 'approved' }),
    receipt({ id: 'd'.repeat(64), state: 'prepared' }),
    receipt({ id: 'e'.repeat(64), state: 'posted' }),
  ]} />);
  expect(screen.getByRole('heading', { name: 'Perlu Konfirmasi' })).toBeInTheDocument();
  expect(screen.getByText('1 perlu ditinjau')).toBeInTheDocument();
  expect(screen.getAllByText('Menunggu pencatatan')).toHaveLength(2);
  expect(screen.getByText(/Status tercatat mengikuti hasil pemroses/)).toBeInTheDocument();
  expect(screen.queryByText('Tercatat')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Riwayat/ }));
  expect(screen.getByText('Tercatat')).toBeInTheDocument();
  expect(screen.getAllByText(fmtFull(100000).replace(/\s/g, ' '))).toHaveLength(4);
});
