import { useEffect, useState } from 'react';
import { PAGE_ACTIONS_ID } from '../../context/pageActions';
import NavIcon from '../icons/NavIcon';

/**
 * Topbar — sticky app bar above the scroll container.
 *
 * Rebuild of the reference's `<header class="topbar">` from
 * `budgetx-app.html` (`data-od-id="topbar"`). The centred title is hidden by
 * default and fades in once the page scrolls past 18px, which is what
 * `[data-scrolled='true'] .topbarTitle` keys off in the reference CSS.
 * The 18px threshold and the window-scroll source are the reference's.
 *
 * `onAddTx` renders the same circular `.iconBtn` launcher the reference uses
 * for `cta-tx-new`.
 *
 * The reference's `pageHeader(title, sub, actions)` returns only the title and
 * subtitle — `actions` is stashed on HEAD and rendered into `.topbarActions`,
 * i.e. the page's primary buttons live in the sticky bar, not in the scrolling
 * title block. `actions` below is that slot.
 *
 * @param {Object} props
 * @param {string} props.page - Current page id, used for the title
 * @param {() => void} [props.onAddTx] - Opens the add-transaction modal
 * @param {Object} [props.user] - Auth user, for the mobile avatar
 * @param {React.ReactNode} [props.actions] - Page header actions
 */
const TITLES = {
  dashboard: 'Dashboard',
  wallet: 'Dompet',
  tx: 'Transaksi',
  budget: 'Budget',
  recurring: 'Langganan Rutin',
  subscription: 'Subscription',
  debt: 'Utang & Piutang',
  invest: 'Investasi',
  asset: 'Aset Tetap',
  report: 'Laporan',
  fire: 'FIRE',
  settings: 'Pengaturan',
  help: 'Bantuan',
};

export default function Topbar({ page, onAddTx, user, actions }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // The shell scrolls the window (see the `.appScroll` note in App.css),
    // matching the reference's `window.scrollY > 18` threshold.
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : null;

  return (
    <header
      className="topbar"
      data-scrolled={scrolled ? 'true' : 'false'}
      data-od-id="topbar"
    >
      <div className="topbarLead mobileOnly">
        {initials && (
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
            {initials}
          </span>
        )}
      </div>
      <span className="topbarTitle" data-od-id="topbar-title">
        {TITLES[page] || 'BudgetX'}
      </span>
      <div className="topbarActions">
        {/* Mount point for `usePageActions`; `actions` is the escape hatch for
            callers that already hold the node. */}
        <span id={PAGE_ACTIONS_ID} className="topbarActionsSlot" />
        {actions}
        {onAddTx && (
          <button
            className="iconBtn"
            type="button"
            onClick={() => onAddTx()}
            aria-label="Tambah Transaksi"
          >
            <NavIcon name="plus" size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
