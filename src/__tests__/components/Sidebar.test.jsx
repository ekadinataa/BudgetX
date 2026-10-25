import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Sidebar, { NAV_ITEMS, NAV_GROUPS } from '../../components/Sidebar/Sidebar.jsx';
import Topbar from '../../components/Topbar/Topbar.jsx';

const props = () => ({ page: 'dashboard', setPage: vi.fn(), darkMode: false, setDarkMode: vi.fn(), onAddTx: vi.fn(), onSearch: vi.fn(), onLogout: vi.fn() });
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });

describe('reference navigation and utility rail', () => {
  it('renders the brand in the top bar rather than the utility rail', () => {
    render(<Topbar {...props()} />);
    expect(screen.getByRole('button', { name: 'BudgetX — beranda' })).toBeInTheDocument();
    expect(screen.getByText('keuangan pribadi')).toBeInTheDocument();
  });

  it('contains all fourteen unique production destinations, including FIRE and Wishlist', () => {
    expect(NAV_ITEMS).toHaveLength(14);
    expect(new Set(NAV_ITEMS.map(item => item.id)).size).toBe(14);
    expect(NAV_ITEMS.map(item => item.id)).toContain('fire');
    expect(NAV_ITEMS.map(item => item.id)).toContain('wishlist');
  });

  it('groups finance, planning, and assets into the approved capsules', () => {
    render(<Topbar {...props()} />);
    expect([...document.querySelectorAll('.navDetails > summary')].map(el => el.textContent)).toEqual(['Keuangan', 'Perencanaan', 'Aset & kewajiban']);
    expect(NAV_GROUPS.flatMap(group => group.items)).toHaveLength(10);
  });

  it('exposes every destination in the mobile menu', () => {
    render(<Topbar {...props()} />);
    fireEvent.click(screen.getByLabelText('Buka navigasi'));
    const nav = screen.getByRole('navigation', { name: 'Semua halaman' });
    for (const item of NAV_ITEMS) expect(within(nav).getByRole('button', { name: item.label, exact: true })).toBeInTheDocument();
  });

  it('marks both the active destination and its group', () => {
    render(<Topbar {...props()} page="wallet" />);
    const group = document.querySelector('.navDetails[data-current="true"]');
    expect(group.querySelector('summary')).toHaveTextContent('Keuangan');
    expect(group.querySelector('[aria-current="page"]')).toHaveAttribute('data-page', 'wallet');
  });

  it('navigates and closes the mobile menu', () => {
    const p = props();
    render(<Topbar {...p} />);
    fireEvent.click(screen.getByLabelText('Buka navigasi'));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Semua halaman' })).getByRole('button', { name: 'FIRE' }));
    expect(p.setPage).toHaveBeenCalledWith('fire');
    expect(document.querySelector('.mobileNavMenu').open).toBe(false);
  });

  it('dismisses a capsule with Escape and returns focus to its summary', () => {
    render(<Topbar {...props()} />);
    const details = document.querySelector('.navDetails');
    details.open = true;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')).toHaveFocus();
  });

  it('dismisses an open menu on an outside click', () => {
    render(<Topbar {...props()} />);
    const details = document.querySelector('.navDetails');
    details.open = true;
    fireEvent.click(document.body);
    expect(details.open).toBe(false);
  });

  it('labels the theme toggle with the mode it switches to', () => {
    const { rerender } = render(<Sidebar {...props()} />);
    expect(screen.getByRole('button', { name: 'Mode gelap' })).toBeInTheDocument();
    rerender(<Sidebar {...props()} darkMode />);
    expect(screen.getByRole('button', { name: 'Mode terang' })).toBeInTheDocument();
  });

  it('toggles the theme through the existing functional setter', () => {
    const p = props();
    render(<Sidebar {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mode gelap' }));
    expect(p.setDarkMode.mock.calls[0][0](false)).toBe(true);
  });

  it('opens search and compose without passing a click event as transaction type', () => {
    const p = props();
    render(<Sidebar {...p} />);
    const rail = within(screen.getByRole('complementary'));
    fireEvent.click(rail.getByRole('button', { name: 'Cari transaksi' }));
    fireEvent.click(rail.getByRole('button', { name: 'Tambah Transaksi' }));
    expect(p.onSearch).toHaveBeenCalledOnce();
    expect(p.onAddTx).toHaveBeenCalledWith();
  });

  it('keeps every utility icon visible and named with a legacy collapsed preference', () => {
    render(<Sidebar {...props()} collapsed />);
    const buttons = within(screen.getByRole('complementary')).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).toBeTruthy();
      expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    }
  });

  it('shows the account control and logout only for authenticated users', () => {
    const p = props();
    const { rerender } = render(<><Sidebar {...p} /><Topbar {...p} /></>);
    expect(screen.queryByRole('button', { name: 'Keluar' })).not.toBeInTheDocument();
    rerender(<><Sidebar {...p} user={{ email: 'uji@example.com' }} /><Topbar {...p} user={{ email: 'uji@example.com' }} /></>);
    expect(screen.getByRole('button', { name: 'Akun uji@example.com' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Keluar' }));
    expect(p.onLogout).toHaveBeenCalledOnce();
  });

  it('retains four bottom destinations and a central compose action', () => {
    render(<Sidebar {...props()} />);
    const nav = screen.getByRole('navigation', { name: 'Navigasi bawah' });
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
    expect(within(nav).getByRole('button', { name: 'Tambah Transaksi' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect([...nav.querySelectorAll('[data-page]')].map(el => el.dataset.page)).toEqual(['dashboard', 'tx', 'report', 'settings']);
  });

  it('keeps help and settings reachable from the rail', () => {
    const p = props();
    render(<Sidebar {...p} />);
    const rail = within(screen.getByRole('complementary'));
    fireEvent.click(rail.getByRole('button', { name: 'Bantuan' }));
    fireEvent.click(rail.getByRole('button', { name: 'Pengaturan' }));
    expect(p.setPage.mock.calls).toEqual([['help'], ['settings']]);
  });
});
