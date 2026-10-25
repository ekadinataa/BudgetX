import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WishlistItemEditor from '../../pages/Wishlist/WishlistItemEditor';
afterEach(cleanup);
const draft = { name: 'Komputer', price: '100000', priority: 'medium', notes: 'Ukuran meja\nWarna hitam' };
const handlers = () => ({ onChange: vi.fn(), onSubmit: vi.fn(e => e.preventDefault()), onCancel: vi.fn() });
it('replaces both reference fields with one optional multiline notes field', () => {
  render(<WishlistItemEditor draft={draft} {...handlers()} />);
  const notes = screen.getByRole('textbox', { name: 'Catatan (opsional)' });
  expect(notes.tagName).toBe('TEXTAREA');
  expect(notes).not.toBeRequired();
  expect(notes).toHaveAttribute('maxlength', '1000');
  expect(notes).toHaveAttribute('rows', '3');
  expect(notes).toHaveValue(draft.notes);
  expect(screen.queryByLabelText('Marketplace / toko')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Tautan produk (opsional)')).not.toBeInTheDocument();
});
it('forwards multiline and empty notes without changing unrelated fields', () => {
  const callbacks = handlers();
  const { rerender } = render(<WishlistItemEditor draft={draft} {...callbacks} />);
  fireEvent.change(screen.getByLabelText('Catatan (opsional)'), { target: { value: 'Baris 1\nBaris 2' } });
  expect(callbacks.onChange).toHaveBeenLastCalledWith('notes', 'Baris 1\nBaris 2');
  rerender(<WishlistItemEditor draft={{ ...draft, notes: 'Baris 1\nBaris 2' }} {...callbacks} />);
  fireEvent.change(screen.getByLabelText('Catatan (opsional)'), { target: { value: '' } });
  expect(callbacks.onChange).toHaveBeenLastCalledWith('notes', '');
  expect(screen.getByLabelText('Nama item')).toHaveValue(draft.name);
});
it('opens legacy items with empty notes rather than injecting old references', () => {
  render(<WishlistItemEditor draft={{ name: 'Lama', price: '100', priority: 'low', marketplaceName: 'Toko Lama', productUrl: 'https://example.com' }} {...handlers()} />);
  expect(screen.getByLabelText('Catatan (opsional)')).toHaveValue('');
  expect(screen.queryByDisplayValue('Toko Lama')).not.toBeInTheDocument();
});
it('disables notes while pending', () => {
  render(<WishlistItemEditor draft={draft} {...handlers()} pending />);
  expect(screen.getByLabelText('Catatan (opsional)')).toBeDisabled();
});
