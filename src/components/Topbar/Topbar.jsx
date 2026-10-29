import { useEffect, useRef } from 'react';
import NavIcon from '../icons/NavIcon';
import BrandLogo from '../BrandLogo';
import { NAV_ITEMS, NAV_GROUPS } from '../Sidebar/Sidebar';

function Destination({ item, page, navigate, withIcon = false }) {
  return <button type="button" data-page={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
    {withIcon && <NavIcon name={item.icon} size={18} />}{item.label}
  </button>;
}

export default function Topbar({ page, setPage, onAddTx, user, darkMode, setDarkMode, onLogout, onSearch }) {
  const header = useRef(null);
  const closeMenus = () => header.current?.querySelectorAll('details[open]').forEach(el => { el.open = false; });
  const navigate = id => { closeMenus(); setPage(id); window.scrollTo({ top: 0, behavior: 'instant' }); };

  useEffect(() => {
    const outside = event => header.current?.querySelectorAll('details[open]').forEach(el => {
      if (!el.contains(event.target)) el.open = false;
    });
    const escape = event => {
      if (event.key !== 'Escape') return;
      header.current?.querySelectorAll('details[open]').forEach(el => {
        el.open = false;
        el.querySelector('summary').focus();
      });
    };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', escape); };
  }, []);

  const initial = (user?.displayName || user?.email || 'Lokal').slice(0, 2).toUpperCase();
  return <header className="topbar" ref={header}>
    <button className="brandTop" type="button" onClick={() => navigate('dashboard')} aria-label="BudgetX — beranda">
      <BrandLogo /><small>keuangan pribadi</small>
    </button>
    <nav className="topnav" aria-label="Navigasi utama">
      <Destination item={{ id: 'dashboard', label: 'Ringkasan' }} page={page} navigate={navigate} />
      {NAV_GROUPS.map(group => <details className="navDetails" key={group.label} data-current={group.items.includes(page)}>
        <summary>{group.label}</summary>
        <div className="navDrop">{group.items.map(id => <Destination key={id} item={NAV_ITEMS.find(item => item.id === id)} page={page} navigate={navigate} />)}</div>
      </details>)}
      <Destination item={{ id: 'report', label: 'Laporan' }} page={page} navigate={navigate} />
    </nav>
    <div className="topbarActions">
      {onAddTx && page !== 'wishlist' && <button className="iconBtn" type="button" aria-label="Tambah Transaksi" onClick={() => onAddTx()}><NavIcon name="plus" size={18} /></button>}
      <button className="iconBtn desktopHelp" type="button" aria-label="Bantuan" onClick={() => navigate('help')}><NavIcon name="help" size={18} /></button>
      <button className="topProfile" type="button" aria-label={user?.email ? `Akun ${user.email}` : 'Pengaturan mode lokal'} onClick={() => navigate('settings')}>{initial}</button>
      <details className="mobileNavMenu">
        <summary aria-label="Buka navigasi"><NavIcon name="menu" size={20} /></summary>
        <nav className="mobileNavPanel" aria-label="Semua halaman">
          {NAV_ITEMS.map(item => <Destination key={item.id} item={item} page={page} navigate={navigate} withIcon />)}
          <div className="mobileNavDivider" />
          <button type="button" onClick={() => { closeMenus(); onSearch(); }}><NavIcon name="search" size={18} />Cari transaksi</button>
          <button type="button" onClick={() => setDarkMode(d => !d)}><NavIcon name={darkMode ? 'sun' : 'moon'} size={18} />Mode {darkMode ? 'terang' : 'gelap'}</button>
          {user && <button type="button" onClick={onLogout}><NavIcon name="logout" size={18} />Keluar</button>}
        </nav>
      </details>
    </div>
  </header>;
}
