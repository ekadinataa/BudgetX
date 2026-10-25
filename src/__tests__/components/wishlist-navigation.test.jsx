import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Sidebar, { NAV_GROUPS, TAB_ITEMS } from '../../components/Sidebar/Sidebar.jsx';
import Topbar from '../../components/Topbar/Topbar.jsx';
import NavIcon from '../../components/icons/NavIcon.jsx';
afterEach(cleanup);
describe('Wishlist navigation', () => {
  it('places Wishlist under Komitmen with an actual icon and native active navigation', () => {
    expect(NAV_GROUPS.find(g => g.label === 'Komitmen').items).toContain('wishlist');
    const setPage = vi.fn();
    render(<Sidebar page="wishlist" setPage={setPage} setDarkMode={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Wishlist' });
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(button.querySelector('svg')).toBeTruthy();
    fireEvent.click(button);
    expect(setPage).toHaveBeenCalledWith('wishlist');
    expect(TAB_ITEMS.map(i => i.id)).toEqual(['dashboard', 'tx', '__fab__', 'report', 'settings']);
  });
  it('titles the topbar Wishlist without a transaction fallback', () => {
    const { container } = render(<Topbar page="wishlist" onAddTx={vi.fn()} />);
    expect(container.querySelector('.topbarTitle')).toHaveTextContent('Wishlist');
    expect(screen.queryByRole('button', { name: 'Tambah Transaksi' })).not.toBeInTheDocument();
  });
  it('maps the wishlist icon to Lucide', () => {
    const { container } = render(<NavIcon name="wishlist" size={18} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '18');
  });
});
