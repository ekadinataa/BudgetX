import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { NAV_GROUPS, TAB_ITEMS } from '../../components/Sidebar/Sidebar.jsx';
import Topbar from '../../components/Topbar/Topbar.jsx';
import NavIcon from '../../components/icons/NavIcon.jsx';
afterEach(cleanup);
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
describe('Wishlist navigation', () => {
  it('places Wishlist under Perencanaan with active desktop and icon-bearing mobile navigation', () => {
    expect(NAV_GROUPS.find(g => g.label === 'Perencanaan').items).toContain('wishlist');
    const setPage = vi.fn();
    render(<Topbar page="wishlist" setPage={setPage} setDarkMode={vi.fn()} />);
    const group = document.querySelector('.navDetails[data-current="true"]');
    expect(group.querySelector('summary')).toHaveTextContent('Perencanaan');
    fireEvent.click(group.querySelector('summary'));
    const desktop = within(group).getByRole('button', { name: 'Wishlist', exact: true });
    expect(desktop).toHaveAttribute('aria-current', 'page');
    fireEvent.click(desktop);
    expect(group.open).toBe(false);
    fireEvent.click(screen.getByLabelText('Buka navigasi'));
    const button = within(screen.getByRole('navigation', { name: 'Semua halaman' })).getByRole('button', { name: 'Wishlist', exact: true });
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(button.querySelector('svg')).toBeTruthy();
    fireEvent.click(button);
    expect(setPage).toHaveBeenCalledWith('wishlist');
    expect(TAB_ITEMS.map(i => i.id)).toEqual(['dashboard', 'tx', '__fab__', 'report', 'settings']);
  });
  it('highlights the planning capsule without a topbar transaction fallback', () => {
    const { container } = render(<Topbar page="wishlist" onAddTx={vi.fn()} />);
    expect(container.querySelector('.navDetails[data-current="true"] > summary')).toHaveTextContent('Perencanaan');
    expect(screen.queryByRole('button', { name: 'Tambah Transaksi' })).not.toBeInTheDocument();
  });
  it('maps the wishlist icon to Lucide', () => {
    const { container } = render(<NavIcon name="wishlist" size={18} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '18');
  });
});
