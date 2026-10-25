import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WishlistItemEditor from '../../pages/Wishlist/WishlistItemEditor';
import WishlistGroupEditor from '../../pages/Wishlist/WishlistGroupEditor';

const itemDraft = { name: 'Komputer', price: '100000', priority: 'medium', notes: 'Cek ukuran meja' };
const groupDraft = { title: 'Ruang Kerja', targetBudget: '1000000', targetDate: '2026-12-01' };
const callbacks = () => ({ onChange: vi.fn(), onSubmit: vi.fn(event => event.preventDefault()), onCancel: vi.fn() });

afterEach(cleanup);

describe('Wishlist popup editors', () => {
  it('omits item context when groupTitle is not provided', () => {
    const { container } = render(<WishlistItemEditor draft={itemDraft} {...callbacks()} />);
    expect(container.querySelector('.wishlistEditorIntro')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Nama item' })).toHaveValue(itemDraft.name);
  });

  it('defaults group creation to an expanded schedule', () => {
    const { container } = render(<WishlistGroupEditor draft={groupDraft} {...callbacks()} />);
    expect(container.querySelector('details').open).toBe(true);
    expect(screen.getByRole('button', { name: 'Simpan Wishlist' })).toBeInTheDocument();
  });

  it.each([
    [WishlistItemEditor, itemDraft, 'Harga (Rp)'],
    [WishlistGroupEditor, groupDraft, 'Target dana (Rp)'],
  ])('preserves native validation limits for %s', (Editor, draft, amountLabel) => {
    const { container } = render(<Editor draft={draft} {...callbacks()} />);
    const amount = screen.getByRole('spinbutton', { name: amountLabel });
    expect(amount).toBeRequired();
    expect(amount).toHaveAttribute('min', '1');
    expect(amount).toHaveAttribute('step', '1');
    expect(amount).toHaveAttribute('max', String(Number.MAX_SAFE_INTEGER));
    expect(amount).toHaveAttribute('inputmode', 'numeric');
    for (const input of container.querySelectorAll('input')) {
      expect(input).toHaveAttribute('maxlength', '1000');
      expect(input).toHaveClass('inputField');
      expect(input.closest('.field')).not.toBeNull();
      const label = container.querySelector(`label[for="${input.id}"]`);
      expect(label).toHaveClass('inputLabel');
    }
  });

  it.each([
    [WishlistItemEditor, itemDraft, 'Simpan Item', [
      ['Nama item', 'name', 'Monitor'],
      ['Harga (Rp)', 'price', '250000'],
      ['Urgensi / prioritas', 'priority', 'high'],
      ['Catatan (opsional)', 'notes', 'Warna hitam\nUkuran kecil'],
    ]],
    [WishlistGroupEditor, groupDraft, 'Simpan Wishlist', [
      ['Judul wishlist', 'title', 'Studio'],
      ['Target dana (Rp)', 'targetBudget', '3000000'],
      ['Tanggal target', 'targetDate', '2027-01-15'],
    ]],
  ])('forwards field changes, submit events, and cancellation for %s', (Editor, draft, submitLabel, changes) => {
    const handlers = callbacks();
    const original = { ...draft };
    const { container, rerender } = render(<Editor draft={draft} {...handlers} />);
    const updated = { ...draft };
    for (const [label, field, value] of changes) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(handlers.onChange).toHaveBeenLastCalledWith(field, value);
      updated[field] = value;
    }
    expect(handlers.onChange).toHaveBeenCalledTimes(changes.length);
    expect(draft).toEqual(original);
    rerender(<Editor draft={updated} {...handlers} />);
    for (const [label, , value] of changes) expect(screen.getByLabelText(label)).toHaveValue(label.includes('(Rp)') ? Number(value) : value);
    const form = container.querySelector('form');
    fireEvent.click(screen.getByRole('button', { name: submitLabel }));
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(handlers.onSubmit.mock.calls[0][0].target).toBe(form);
    expect(handlers.onSubmit.mock.calls[0][0].defaultPrevented).toBe(true);
    expect(handlers.onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.modalActions')).toContainElement(screen.getByRole('button', { name: submitLabel }));
  });

  it.each([
    [WishlistItemEditor, itemDraft, 'Simpan Item'],
    [WishlistGroupEditor, groupDraft, 'Simpan Wishlist'],
  ])('disables every input and action while pending for %s', (Editor, draft, submitLabel) => {
    const handlers = callbacks();
    const { container, rerender } = render(<Editor draft={draft} {...handlers} pending />);
    expect(container.querySelector('fieldset')).toBeDisabled();
    for (const control of container.querySelectorAll('input, textarea, select, button')) expect(control).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: submitLabel }));
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
    rerender(<Editor draft={draft} {...handlers} pending={false} />);
    for (const control of container.querySelectorAll('input, textarea, select, button')) expect(control).not.toBeDisabled();
  });

  it('uses distinct input identifiers across simultaneous editor instances', () => {
    const { container } = render(<>
      <WishlistItemEditor draft={itemDraft} {...callbacks()} />
      <WishlistItemEditor draft={itemDraft} {...callbacks()} />
      <WishlistGroupEditor draft={groupDraft} {...callbacks()} />
      <WishlistGroupEditor draft={groupDraft} {...callbacks()} />
    </>);
    const controls = [...container.querySelectorAll('input, textarea, select')];
    expect(new Set(controls.map(control => control.id)).size).toBe(controls.length);
    for (const control of controls) expect(container.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
  });

  it.each([false, true])('blocks schedule activation while pending (editing=%s)', editing => {
    const { container, rerender } = render(<WishlistGroupEditor draft={groupDraft} {...callbacks()} editing={editing} pending />);
    const schedule = container.querySelector('details.wishlistSchedule');
    const summary = screen.getByText('Jadwal target');
    expect(summary).toHaveAttribute('aria-disabled', 'true');
    summary.focus();
    expect(summary).toHaveFocus();
    expect(fireEvent.click(summary)).toBe(false);
    expect(schedule.open).toBe(!editing);
    expect(fireEvent.keyDown(summary, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(summary, { key: ' ' })).toBe(false);
    expect(schedule.open).toBe(!editing);
    rerender(<WishlistGroupEditor draft={groupDraft} {...callbacks()} editing={editing} pending={false} />);
    expect(summary).toHaveAttribute('aria-disabled', 'false');
    expect(fireEvent.keyDown(summary, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(summary, { key: ' ' })).toBe(true);
    expect(fireEvent.click(summary)).toBe(true);
    expect(schedule.open).toBe(editing);
  });

  it.each([false, true])('presents group reference fields with a preserved required date (editing=%s)', editing => {
    const handlers = callbacks();
    const { container, rerender } = render(<WishlistGroupEditor draft={groupDraft} {...handlers} editing={editing} />);
    const form = container.querySelector('form');
    expect(form).toHaveClass('wishlistEditor');
    expect(form).toHaveAttribute('novalidate');
    expect(container.querySelector('p.wishlistEditorIntro')).toHaveTextContent('Satu kelompok untuk satu rencana. Tentukan judul dan nominal target dana Anda.');
    const title = screen.getByRole('textbox', { name: 'Judul wishlist' });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('data-autofocus');
    expect(title).toBeRequired();
    expect(screen.getByRole('spinbutton', { name: 'Target dana (Rp)' })).toBeRequired();
    const date = screen.getByLabelText('Tanggal target');
    const schedule = date.closest('details.wishlistSchedule');
    expect(schedule).not.toBeNull();
    expect(schedule.open).toBe(!editing);
    const summary = within(schedule).getByText('Jadwal target');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary).toHaveAttribute('tabindex', '0');
    expect(summary).toHaveAttribute('aria-disabled', 'false');
    expect(date).toBeRequired();
    expect(date).toHaveAttribute('type', 'date');
    expect(date).toHaveValue(groupDraft.targetDate);
    if (editing) {
      expect(date).not.toBeVisible();
      fireEvent.click(summary);
      expect(schedule.open).toBe(true);
    }
    expect(date).toBeVisible();
    fireEvent.change(date, { target: { value: '2027-02-01' } });
    expect(handlers.onChange).toHaveBeenCalledWith('targetDate', '2027-02-01');
    rerender(<WishlistGroupEditor draft={{ ...groupDraft, targetDate: '2027-02-01' }} {...handlers} editing={editing} />);
    expect(date).toHaveValue('2027-02-01');
    expect(schedule.open).toBe(true);
    expect(screen.getByRole('button', { name: editing ? 'Simpan Perubahan' : 'Simpan Wishlist' })).toHaveAttribute('type', 'submit');
    expect(container.querySelector('footer')).toBeNull();
  });

  it('lays out the item reference fields with contextual title and preferred initial focus', () => {
    const { container } = render(<WishlistItemEditor draft={itemDraft} {...callbacks()} groupTitle="Ruang Kerja" />);
    const form = container.querySelector('form');
    expect(form).toHaveClass('wishlistEditor');
    expect(form).toHaveAttribute('novalidate');
    expect(screen.getByText('Wishlist:', { exact: false })).toHaveTextContent('Wishlist: Ruang Kerja');
    expect(container.querySelector('p.wishlistEditorIntro')).toHaveTextContent('Wishlist: Ruang Kerja');
    const name = screen.getByRole('textbox', { name: 'Nama item' });
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('data-autofocus');
    expect(name).toBeRequired();
    const price = screen.getByRole('spinbutton', { name: 'Harga (Rp)' });
    const priority = screen.getByRole('combobox', { name: 'Urgensi / prioritas' });
    const pair = price.closest('div.wishlistFieldPair');
    expect(pair).not.toBeNull();
    expect(pair).toContainElement(priority);
    expect(pair.children).toHaveLength(2);
    expect(priority).toHaveValue('medium');
    expect(within(priority).getAllByRole('option').map(option => [option.value, option.textContent])).toEqual([
      ['high', 'Tinggi'], ['medium', 'Sedang'], ['low', 'Rendah'],
    ]);
    const notes = screen.getByRole('textbox', { name: 'Catatan (opsional)' });
    expect(notes.tagName).toBe('TEXTAREA');
    expect(notes).toHaveAttribute('maxlength', '1000');
    expect(notes).not.toBeRequired();
    for (const input of [name, notes]) {
      expect(input.closest('.wishlistFieldPair')).toBeNull();
      expect(input.closest('.field').parentElement).toBe(form.querySelector('fieldset'));
    }
    expect(screen.getByRole('button', { name: 'Simpan Item' })).toHaveAttribute('type', 'submit');
    expect(container.querySelector('footer')).toBeNull();
  });
});
