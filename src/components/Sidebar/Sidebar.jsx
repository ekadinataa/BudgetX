import NavIcon from '../icons/NavIcon';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'wallet', label: 'Dompet', icon: 'wallet' },
  { id: 'tx', label: 'Transaksi', icon: 'tx' },
  { id: 'budget', label: 'Anggaran', icon: 'budget' },
  { id: 'recurring', label: 'Berkala', icon: 'recurring' },
  { id: 'subscription', label: 'Langganan', icon: 'subscription' },
  { id: 'debt', label: 'Utang/Piutang', icon: 'debt' },
  { id: 'wishlist', label: 'Wishlist', icon: 'wishlist' },
  { id: 'invest', label: 'Investasi', icon: 'invest' },
  { id: 'asset', label: 'Aset', icon: 'asset' },
  { id: 'report', label: 'Laporan', icon: 'report' },
  { id: 'fire', label: 'FIRE', icon: 'fire' },
  { id: 'settings', label: 'Pengaturan', icon: 'settings' },
  { id: 'help', label: 'Bantuan', icon: 'help' },
];
const NAV_GROUPS = [
  { label: 'Keuangan', items: ['tx', 'wallet'] },
  { label: 'Perencanaan', items: ['budget', 'recurring', 'subscription', 'wishlist'] },
  { label: 'Aset & kewajiban', items: ['debt', 'invest', 'asset', 'fire'] },
];
const TAB_ITEMS = ['dashboard', 'tx', '__fab__', 'report', 'settings'].map(id =>
  id === '__fab__' ? { id } : NAV_ITEMS.find(item => item.id === id));

/** Floating utilities; destinations live in Topbar's desktop/mobile navigation. */
export default function Sidebar({ page, setPage, darkMode, setDarkMode, user, onLogout, onAddTx, onSearch }) {
  const tools = [
    { label: 'Cari transaksi', icon: 'search', action: onSearch },
    { label: 'Tambah Transaksi', icon: 'plus', action: () => onAddTx() },
    { label: `Mode ${darkMode ? 'terang' : 'gelap'}`, icon: darkMode ? 'sun' : 'moon', action: () => setDarkMode(d => !d) },
    { label: 'Bantuan', icon: 'help', action: () => setPage('help') },
    { label: 'Pengaturan', icon: 'settings', action: () => setPage('settings') },
    ...(user ? [{ label: 'Keluar', icon: 'logout', action: onLogout }] : []),
  ];
  return <>
    <aside className="sidebar" aria-label="Utilitas">
      <div className="sidebarFoot">{tools.map((tool, index) => <button className="railButton" type="button" key={tool.label} aria-label={tool.label} data-tip={tool.label} data-divider={index === 2 || undefined} onClick={tool.action}>
        <NavIcon name={tool.icon} size={index === 1 ? 20 : 18} />
      </button>)}</div>
    </aside>
    <nav className="tabbar" aria-label="Navigasi bawah">
      {TAB_ITEMS.map(item => item.id === '__fab__'
        ? <button key="compose" className="tabItem" type="button" onClick={() => onAddTx()} aria-label="Tambah Transaksi"><span className="tabCompose"><NavIcon name="plus" size={19} /></span></button>
        : <button key={item.id} className={`tabItem${page === item.id ? ' tabItemActive' : ''}`} type="button" data-page={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => { setPage(item.id); window.scrollTo({ top: 0, behavior: 'instant' }); }}><NavIcon name={item.icon} size={20} /><span>{item.label}</span></button>)}
    </nav>
  </>;
}

export { NAV_ITEMS, NAV_GROUPS, TAB_ITEMS };
