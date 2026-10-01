import NavIcon from '../icons/NavIcon';

/**
 * Navigation model, ported from the reference (budgetx-app.html).
 *
 * The reference groups the sidebar into four sections instead of one flat
 * list. `help` is deliberately absent from the reference's NAV; it is kept
 * here under "Analisa" so the existing Help page stays reachable.
 */
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'wallet', label: 'Dompet', icon: 'wallet' },
  { id: 'tx', label: 'Transaksi', icon: 'tx' },
  { id: 'budget', label: 'Budget', icon: 'budget' },
  { id: 'recurring', label: 'Berkala', icon: 'recurring' },
  { id: 'subscription', label: 'Langganan', icon: 'subscription' },
  { id: 'debt', label: 'Utang/Piutang', icon: 'debt' },
  { id: 'invest', label: 'Investasi', icon: 'invest' },
  { id: 'asset', label: 'Aset', icon: 'asset' },
  { id: 'report', label: 'Laporan', icon: 'report' },
  { id: 'settings', label: 'Pengaturan', icon: 'settings' },
  { id: 'help', label: 'Bantuan', icon: 'help' },
];

const NAV_GROUPS = [
  { label: 'Ringkasan', items: ['dashboard', 'wallet', 'tx', 'budget'] },
  { label: 'Komitmen', items: ['recurring', 'subscription', 'debt'] },
  { label: 'Aset', items: ['invest', 'asset'] },
  { label: 'Analisa', items: ['report', 'settings', 'help'] },
];

/** Mobile tab bar: 4 destinations with a compose button in the centre. */
const TAB_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tx', label: 'Transaksi', icon: 'tx' },
  { id: '__fab__', label: '', icon: 'plus' },
  { id: 'report', label: 'Laporan', icon: 'report' },
  { id: 'settings', label: 'Pengaturan', icon: 'settings' },
];

const findNav = (id) => NAV_ITEMS.find((n) => n.id === id);

/**
 * Sidebar — desktop navigation rail with grouped sections, plus the mobile
 * tab bar. Both the collapse state and the active page live on <html> as
 * data attributes so the CSS can drive width and label visibility without
 * React re-rendering the nav (see styles/base.css `[data-collapsed]`).
 *
 * @param {Object} props
 * @param {string} props.page - Currently active page id
 * @param {(page: string) => void} props.setPage - Page navigation callback
 * @param {boolean} props.darkMode - Whether dark mode is active
 * @param {(fn: (prev: boolean) => boolean) => void} props.setDarkMode - Dark mode toggle callback
 * @param {boolean} [props.collapsed] - Whether the rail is collapsed to icons
 * @param {(fn: (prev: boolean) => boolean) => void} [props.onToggleCollapse]
 * @param {Object} [props.user] - Firebase user object (optional)
 * @param {() => void} [props.onLogout] - Logout callback (optional)
 * @param {() => void} [props.onAddTx] - Opens the add-transaction modal
 */
export default function Sidebar({
  page,
  setPage,
  darkMode,
  setDarkMode,
  collapsed,
  onToggleCollapse,
  user,
  onLogout,
  onAddTx,
}) {
  const initial = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <>
      <aside className="sidebar">
        <button className="logo" type="button" onClick={() => setPage('dashboard')} aria-label="BudgetX — beranda">
          <img src="/logo.png" alt="" className="logoImg" width={30} height={30} />
          <span className="brandText">
            <span className="brandName">BudgetX</span>
            <span className="brandSub">Money Tracker</span>
          </span>
        </button>

        <nav className="nav" aria-label="Navigasi utama">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="navGroup">
              <div className="navGroupLabel">{group.label}</div>
              {group.items.map((id) => {
                const item = findNav(id);
                if (!item) return null;
                const active = item.id === page;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`navItem${active ? ' navItemActive' : ''}`}
                    data-page={item.id}
                    onClick={() => setPage(item.id)}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="navIcon">
                      <NavIcon name={item.icon} size={18} />
                    </span>
                    <span className="navLabel">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebarFoot">
          {onLogout && (
            <button className="sidebarAction" type="button" onClick={onLogout} title={collapsed ? 'Keluar' : undefined}>
              <span className="navIcon" aria-hidden="true">
                <NavIcon name="logout" size={18} />
              </span>
              <span className="sidebarActionLabel">Keluar</span>
            </button>
          )}
          <button
            className="sidebarAction"
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            title={collapsed ? (darkMode ? 'Mode terang' : 'Mode gelap') : undefined}
          >
            <span className="navIcon" aria-hidden="true">
              <NavIcon name={darkMode ? 'sun' : 'moon'} size={18} />
            </span>
            <span className="sidebarActionLabel">Mode {darkMode ? 'terang' : 'gelap'}</span>
          </button>
          {onToggleCollapse && (
            <button
              className="sidebarAction"
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? 'Perluas' : 'Ciutkan'}
            >
              <span className="navIcon" aria-hidden="true">
                <NavIcon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={18} />
              </span>
              <span className="sidebarActionLabel">{collapsed ? 'Perluas' : 'Ciutkan'}</span>
            </button>
          )}
          {user && (
            <div className="userSection">
              <span className="avatar" aria-hidden="true">{initial}</span>
              <span className="userEmail truncate">{user.email}</span>
            </div>
          )}
        </div>
      </aside>

      <nav className="tabbar" aria-label="Navigasi bawah">
        {TAB_ITEMS.map((item) => {
          if (item.id === '__fab__') {
            return (
              <button key="fab" className="tabItem" type="button" onClick={() => onAddTx()} aria-label="Tambah Transaksi">
                <span className="tabCompose">
                  <NavIcon name="plus" size={18} />
                </span>
              </button>
            );
          }
          const active = item.id === page;
          return (
            <button
              key={item.id}
              type="button"
              className={`tabItem${active ? ' tabItemActive' : ''}`}
              data-page={item.id}
              onClick={() => setPage(item.id)}
              aria-current={active ? 'page' : undefined}
            >
              <NavIcon name={item.icon} size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

export { NAV_ITEMS, NAV_GROUPS, TAB_ITEMS };
