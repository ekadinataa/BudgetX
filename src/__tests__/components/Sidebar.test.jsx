import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import Sidebar from '../../components/Sidebar/Sidebar';

describe('Sidebar', () => {
  const defaultProps = {
    page: 'dashboard',
    setPage: vi.fn(),
    darkMode: false,
    setDarkMode: vi.fn(),
  };

  it('renders BudgetX branding with logo mark and subtitle', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('BudgetX')).toBeInTheDocument();
    expect(screen.getByText('Money Tracker')).toBeInTheDocument();
  });

  it('renders the full navigation list in the desktop sidebar', () => {
    render(<Sidebar {...defaultProps} />);
    // Pages that also appear in the mobile bottom nav are rendered twice
    for (const label of ['Dashboard', 'Transaksi', 'Laporan', 'Pengaturan']) {
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
    // Sidebar-only pages are rendered once
    for (const label of [
      'Dompet', 'Budget', 'Berkala', 'Langganan',
      'Utang/Piutang', 'Investasi', 'Aset',
    ]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  it('renders a 5-slot mobile bottom nav with a center FAB', () => {
    render(<Sidebar {...defaultProps} />);
    // The FAB occupies the middle slot and carries no text label
    expect(screen.getAllByLabelText('Tambah Transaksi')).toHaveLength(1);
  });

  it('highlights the active navigation item', () => {
    render(<Sidebar {...defaultProps} page="wallet" />);
    // Get the sidebar nav button (first match)
    const walletBtns = screen.getAllByText('Dompet').map((el) => el.closest('button'));
    const sidebarBtn = walletBtns.find((btn) => btn.className.includes('navItem'));
    expect(sidebarBtn.className).toContain('navItemActive');
  });

  it('calls setPage when a navigation item is clicked', () => {
    const setPage = vi.fn();
    render(<Sidebar {...defaultProps} setPage={setPage} />);
    // Click the first "Transaksi" (sidebar nav)
    fireEvent.click(screen.getAllByText('Transaksi')[0]);
    expect(setPage).toHaveBeenCalledWith('tx');
  });

  it('shows "Light Mode" label and sun icon when darkMode is false', () => {
    render(<Sidebar {...defaultProps} darkMode={false} />);
    expect(screen.getByText('Light Mode')).toBeInTheDocument();
  });

  it('shows "Dark Mode" label and moon icon when darkMode is true', () => {
    render(<Sidebar {...defaultProps} darkMode={true} />);
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
  });

  it('calls setDarkMode toggler when theme button is clicked', () => {
    const setDarkMode = vi.fn();
    render(<Sidebar {...defaultProps} setDarkMode={setDarkMode} />);
    fireEvent.click(screen.getByText('Light Mode'));
    expect(setDarkMode).toHaveBeenCalledTimes(1);
    // The callback should be a toggler function
    const toggleFn = setDarkMode.mock.calls[0][0];
    expect(typeof toggleFn).toBe('function');
    expect(toggleFn(false)).toBe(true);
    expect(toggleFn(true)).toBe(false);
  });

  it('displays the active period label', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Periode Aktif')).toBeInTheDocument();
    // The period value should contain the current month and year in Indonesian locale
    const now = new Date();
    const expected = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('navigates through each page correctly', () => {
    const setPage = vi.fn();
    render(<Sidebar {...defaultProps} setPage={setPage} />);

    fireEvent.click(screen.getAllByText('Dashboard')[0]);
    expect(setPage).toHaveBeenCalledWith('dashboard');

    fireEvent.click(screen.getAllByText('Dompet')[0]);
    expect(setPage).toHaveBeenCalledWith('wallet');

    fireEvent.click(screen.getAllByText('Budget')[0]);
    expect(setPage).toHaveBeenCalledWith('budget');

    fireEvent.click(screen.getAllByText('Laporan')[0]);
    expect(setPage).toHaveBeenCalledWith('report');
  });
});
