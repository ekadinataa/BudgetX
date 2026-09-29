import { useState } from 'react';
import NavIcon from '../icons/NavIcon';
import styles from './Sidebar.module.css';

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
];

// Mobile bottom nav items (5 max with FAB in center)
const MOBILE_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tx', label: 'Transaksi', icon: 'tx' },
  { id: '__fab__', label: '', icon: 'plus' }, // FAB placeholder
  { id: 'report', label: 'Laporan', icon: 'report' },
  { id: 'settings', label: 'Pengaturan', icon: 'settings' },
];

/**
 * Sidebar — Persistent left navigation panel with collapse/expand toggle.
 *
 * Displays BudgetX branding, 5 navigation items with active highlighting,
 * a theme toggle button, and the active period label. Can be collapsed to
 * show only icons.
 *
 * @param {Object} props
 * @param {string} props.page - Currently active page id
 * @param {(page: string) => void} props.setPage - Page navigation callback
 * @param {boolean} props.darkMode - Whether dark mode is active
 * @param {(fn: (prev: boolean) => boolean) => void} props.setDarkMode - Dark mode toggle callback
 * @param {Object} [props.user] - Firebase user object (optional)
 * @param {() => void} [props.onLogout] - Logout callback (optional)
 */
export default function Sidebar({ page, setPage, darkMode, setDarkMode, user, onLogout, onAddTx }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const now = new Date();
  const periodText = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <>
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {/* Branding + collapse toggle */}
      <div className={styles.logo}>
        <div className={styles.logoMark}>
          <img src="/logo.png" alt="BudgetX" width="34" height="34" style={{ objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div className={styles.brandText}>
            <div className={styles.brandName}>BudgetX</div>
            <div className={styles.brandSub}>Money Tracker</div>
          </div>
        )}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: collapsed ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={`${styles.navIcon} ${active ? styles.navIconActive : ''}`}>
                <NavIcon name={item.icon} size={18} />
              </span>
              {!collapsed && (
                <span className={`${styles.navLabel} ${active ? styles.navLabelActive : ''}`}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: user info, theme toggle, period */}
      <div className={styles.bottom}>
        {/* User email display */}
        {user && !collapsed && (
          <div className={styles.userSection}>
            <div className={styles.userEmail} title={user.email}>
              {user.email}
            </div>
            {onLogout && (
              <button className={styles.logoutBtn} onClick={onLogout} title="Keluar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {user && collapsed && onLogout && (
          <button
            className={styles.logoutBtnCollapsed}
            onClick={onLogout}
            title="Keluar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        )}

        <button
          className={styles.themeToggle}
          onClick={() => setDarkMode && setDarkMode((d) => !d)}
          title={collapsed ? (darkMode ? 'Dark Mode' : 'Light Mode') : undefined}
        >
          {!collapsed && (
            <span className={styles.themeLabel}>
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
          )}
          <span className={darkMode ? styles.themeIconDark : styles.themeIconLight}>
            <NavIcon name={darkMode ? 'moon' : 'sun'} size={15} />
          </span>
        </button>

        {!collapsed && (
          <>
            <div className={styles.periodLabel}>Periode Aktif</div>
            <div className={styles.periodValue}>{periodText}</div>
          </>
        )}
      </div>
    </aside>

    {/* Bottom navigation for mobile */}
    <nav className={styles.bottomNav}>
      {MOBILE_NAV_ITEMS.map((item) => {
        if (item.id === '__fab__') {
          return (
            <button
              key="fab"
              className={styles.fab}
              onClick={onAddTx}
              aria-label="Tambah Transaksi"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          );
        }
        return (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`${styles.bottomNavItem} ${page === item.id ? styles.bottomNavItemActive : ''}`}
          >
            <NavIcon name={item.icon} size={20} />
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </button>
        );
      })}
    </nav>

    {/* Mobile top bar */}
    {user && (
      <div className={styles.mobileTopBar}>
        <div className={styles.mobileTopLeft}>
          <img src="/logo.png" alt="BudgetX" width="28" height="28" style={{ objectFit: 'contain' }} />
          <span className={styles.mobileTopBrand}>BudgetX</span>
        </div>
        <button className={styles.mobileUserBtn} onClick={() => setShowMobileMenu((v) => !v)}>
          <div className={styles.mobileAvatar}>
            {user.email?.charAt(0).toUpperCase() || 'U'}
          </div>
        </button>

        {/* Mobile user dropdown */}
        {showMobileMenu && (
          <div className={styles.mobileDropdown}>
            <div className={styles.mobileDropdownEmail}>{user.email}</div>
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('wallet'); setShowMobileMenu(false); }}>
              <NavIcon name="wallet" size={16} />
              Dompet
            </button>
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('budget'); setShowMobileMenu(false); }}>
              <NavIcon name="budget" size={16} />
              Budget
            </button>
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('recurring'); setShowMobileMenu(false); }}>
              <NavIcon name="recurring" size={16} />
              Berkala
            </button>
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('subscription'); setShowMobileMenu(false); }}>
              <NavIcon name="subscription" size={16} />
              Langganan
            </button>
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('debt'); setShowMobileMenu(false); }}>
              <NavIcon name="debt" size={16} />
              Utang/Piutang
            </button>
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('invest'); setShowMobileMenu(false); }}>
              <NavIcon name="invest" size={16} />
              Investasi
            </button>
            <div className={styles.mobileDropdownDivider} />
            <button className={styles.mobileDropdownItem} onClick={() => { setPage('help'); setShowMobileMenu(false); }}>
              <NavIcon name="settings" size={16} />
              Bantuan
            </button>
            <button className={styles.mobileDropdownItem} onClick={() => { setDarkMode((d) => !d); setShowMobileMenu(false); }}>
              <NavIcon name={darkMode ? 'sun' : 'moon'} size={16} />
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            {onLogout && (
              <button className={styles.mobileDropdownLogout} onClick={() => { onLogout(); setShowMobileMenu(false); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Keluar
              </button>
            )}
          </div>
        )}
      </div>
    )}
    </>
  );
}
