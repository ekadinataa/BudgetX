import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResetConfirmModal from '../../pages/Settings/ResetConfirmModal';

it('explicitly warns that the global reset deletes Wishlist groups and their items', () => {
  render(<ResetConfirmModal onConfirm={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Reset Data' })).toBeInTheDocument();
  expect(screen.getByText('Kelompok wishlist beserta seluruh itemnya')).toBeInTheDocument();
});
