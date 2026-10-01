import { useState, useMemo } from 'react';
import { fmtFull } from '../../utils/formatters';
import {
  calcTotalMonthlyCost,
  calcTotalYearlyCost,
  getUpcomingSubscriptions,
  getDaysUntilDue,
} from '../../utils/subscriptionHelpers';
import NavIcon from '../../components/icons/NavIcon';
import SubscriptionFormModal from './SubscriptionFormModal';
import SubscriptionCard from './SubscriptionCard';
import { usePageActions } from '../../context/pageActions';
import PayModal from './PayModal';

/**
 * SubscriptionPage — Manage recurring subscriptions and bills.
 *
 * @param {Object} props
 * @param {Array} props.subscriptions - All subscription records
 * @param {Array} props.wallets - Available wallets
 * @param {(data: Object) => Promise} props.onCreateSubscription - Create handler
 * @param {(id: string, data: Object) => Promise} props.onUpdateSubscription - Update handler
 * @param {(id: string) => Promise} props.onDeleteSubscription - Delete handler
 * @param {(id: string, payData: Object) => Promise} props.onPaySubscription - Pay handler
 */
export default function SubscriptionPage({
  subscriptions,
  wallets,
  onCreateSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onPaySubscription,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [payItem, setPayItem] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'inactive'

  // Summary stats
  const totalMonthly = useMemo(() => calcTotalMonthlyCost(subscriptions), [subscriptions]);
  const totalYearly = useMemo(() => calcTotalYearlyCost(subscriptions), [subscriptions]);
  const upcoming = useMemo(() => getUpcomingSubscriptions(subscriptions), [subscriptions]);

  // Filtered list
  const filteredList = useMemo(() => {
    let list = [...subscriptions];
    if (filter === 'active') list = list.filter((s) => s.isActive);
    if (filter === 'inactive') list = list.filter((s) => !s.isActive);
    // Sort: overdue first, then by due date ascending
    return list.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      const daysA = getDaysUntilDue(a.nextDueDate);
      const daysB = getDaysUntilDue(b.nextDueDate);
      return daysA - daysB;
    });
  }, [subscriptions, filter]);

  // Handlers
  const handleSave = async (data) => {
    if (editItem) {
      await onUpdateSubscription(editItem.id, data);
    } else {
      await onCreateSubscription(data);
    }
    setShowForm(false);
    setEditItem(null);
  };

  const handleDelete = async (id) => {
    await onDeleteSubscription(id);
    setShowForm(false);
    setEditItem(null);
  };

  const handlePay = async (payData) => {
    await onPaySubscription(payItem.id, payData);
    setPayItem(null);
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  const handleToggleActive = async (item) => {
    await onUpdateSubscription(item.id, { isActive: !item.isActive });
  };

  const topbarActions = usePageActions(
    <button className="btnPrimary" onClick={() => { setEditItem(null); setShowForm(true); }}>
      <NavIcon name="plus" size={16} /> Tambah
    </button>,
  );

  // `display: contents` so this wrapper does not become a single flex child of
  // `.container`. As a plain `<div>` it absorbed the container's `gap` for the
  // whole page, leaving every card below it flush against its neighbour — which
  // is why the spacing read as cramped rather than merely tight. `{topbarActions}`
  // is a portal and renders null, so nothing else depends on this element.
  return (
    <div className="pageStack">
      {topbarActions}

      {/* Page header */}
      <div className="largeTitleBlock">
        <div>
          <h1 className="largeTitle">Langganan & Tagihan</h1>
          <p className="pageSubtitle">
            Kelola langganan dan tagihan berkala (Netflix, Spotify, Listrik, dll)
          </p>
        </div>

      </div>

      {/* Summary cards */}
      <div className="grid3">
        <div className="statCard">
          <div className="statLabel">Total Bulanan</div>
          <div className="statValue num" style={{ color: 'var(--blue-ink)' }}>
            {fmtFull(Math.round(totalMonthly))}
          </div>
          <div className="statDetail">
            dari {subscriptions.filter((s) => s.isActive).length} langganan aktif
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Tahunan</div>
          <div className="statValue num" style={{ color: 'var(--purple-ink)' }}>
            {fmtFull(Math.round(totalYearly))}
          </div>
          <div className="statDetail">estimasi setahun penuh</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Jatuh Tempo Segera</div>
          <div className="statValue num" style={{ color: upcoming.length > 0 ? 'var(--red-ink)' : 'var(--green-ink)' }}>
            {upcoming.length}
          </div>
          <div className="statDetail">dalam 7 hari ke depan</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="seg">
        {[
          { key: 'all', label: 'Semua' },
          { key: 'active', label: 'Aktif' },
          { key: 'inactive', label: 'Tidak Aktif' },
        ].map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? 'segBtn segBtnActive' : 'segBtn'}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {subscriptions.length === 0 && (
        <div className="emptyState">
          <div className="emptyIcon">💳</div>
          <div className="emptyTitle">Belum ada langganan</div>
          <div className="emptyDesc">
            Tambahkan langganan dan tagihan berkala seperti Netflix, Spotify, Listrik, Internet, BPJS, dll.
            BudgetX akan menghitung total biaya dan mengingatkan saat jatuh tempo.
          </div>
          <button className="btnPrimary" onClick={() => setShowForm(true)}>
            <NavIcon name="plus" size={16} /> Tambah Pertama
          </button>
        </div>
      )}

      {/* Filtered empty state */}
      {subscriptions.length > 0 && filteredList.length === 0 && (
        <div className="emptyState">
          <div className="emptyIcon">🔍</div>
          <div className="emptyTitle">Tidak ada data</div>
          <div className="emptyDesc">
            Tidak ada langganan dengan filter yang dipilih.
          </div>
        </div>
      )}

      {/* Subscription list */}
      {filteredList.map((sub) => (
        <SubscriptionCard
          key={sub.id}
          subscription={sub}
          onEdit={() => handleEdit(sub)}
          onPay={() => setPayItem(sub)}
          onToggleActive={() => handleToggleActive(sub)}
        />
      ))}

      {/* Form Modal */}
      {showForm && (
        <SubscriptionFormModal
          initial={editItem}
          wallets={wallets}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={handleSave}
          onDelete={editItem ? handleDelete : undefined}
        />
      )}

      {/* Pay Modal */}
      {payItem && (
        <PayModal
          subscription={payItem}
          wallets={wallets}
          onClose={() => setPayItem(null)}
          onConfirm={handlePay}
        />
      )}
    </div>
  );
}
