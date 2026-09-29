import { useState, useMemo } from 'react';
import { fmtFull, fmtDate } from '../../utils/formatters';
import {
  calcTotalMonthlyCost,
  calcTotalYearlyCost,
  getDaysUntilDue,
  getUpcomingSubscriptions,
  getBillingCycleLabel,
  getSubscriptionCategoryInfo,
} from '../../utils/subscriptionHelpers';
import NavIcon from '../../components/icons/NavIcon';
import SubscriptionFormModal from './SubscriptionFormModal';
import PayModal from './PayModal';
import styles from './SubscriptionPage.module.css';

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

  return (
    <div>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Langganan & Tagihan</h1>
          <p className={styles.pageSubtitle}>
            Kelola langganan dan tagihan berkala (Netflix, Spotify, Listrik, dll)
          </p>
        </div>
        <button className={styles.addBtn} onClick={() => { setEditItem(null); setShowForm(true); }}>
          <NavIcon name="plus" size={16} /> Tambah
        </button>
      </div>

      {/* Summary cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Bulanan</div>
          <div className={styles.summaryValue} style={{ color: '#4F6EF7' }}>
            {fmtFull(Math.round(totalMonthly))}
          </div>
          <div className={styles.summarySub}>
            dari {subscriptions.filter((s) => s.isActive).length} langganan aktif
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Tahunan</div>
          <div className={styles.summaryValue} style={{ color: '#A855F7' }}>
            {fmtFull(Math.round(totalYearly))}
          </div>
          <div className={styles.summarySub}>estimasi setahun penuh</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Jatuh Tempo Segera</div>
          <div className={styles.summaryValue} style={{ color: upcoming.length > 0 ? '#DC2626' : '#22C55E' }}>
            {upcoming.length}
          </div>
          <div className={styles.summarySub}>dalam 7 hari ke depan</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className={styles.filters}>
        {[
          { key: 'all', label: 'Semua' },
          { key: 'active', label: 'Aktif' },
          { key: 'inactive', label: 'Tidak Aktif' },
        ].map((f) => (
          <button
            key={f.key}
            className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {subscriptions.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>💳</div>
          <div className={styles.emptyTitle}>Belum ada langganan</div>
          <div className={styles.emptyDesc}>
            Tambahkan langganan dan tagihan berkala seperti Netflix, Spotify, Listrik, Internet, BPJS, dll.
            BudgetX akan menghitung total biaya dan mengingatkan saat jatuh tempo.
          </div>
          <button className={styles.addBtn} onClick={() => setShowForm(true)} style={{ margin: '0 auto' }}>
            <NavIcon name="plus" size={16} /> Tambah Langganan Pertama
          </button>
        </div>
      )}

      {/* Filtered empty state */}
      {subscriptions.length > 0 && filteredList.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔍</div>
          <div className={styles.emptyTitle}>Tidak ada data</div>
          <div className={styles.emptyDesc}>
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

/**
 * SubscriptionCard — Single subscription display card.
 */
function SubscriptionCard({ subscription, onEdit, onPay, onToggleActive }) {
  const days = getDaysUntilDue(subscription.nextDueDate);
  const catInfo = getSubscriptionCategoryInfo(subscription.category);
  const cycleLabel = getBillingCycleLabel(subscription.billingCycle);

  // Determine urgency classes
  const getCardClass = () => {
    if (!subscription.isActive) return '';
    if (days < 0) return styles.cardOverdue;
    if (days <= 7) return styles.cardSoon;
    return '';
  };

  const getDueBadgeClass = () => {
    if (days < 0) return styles.badgeOverdue;
    if (days <= 7) return styles.badgeSoon;
    return styles.badgeOk;
  };

  const getDueLabel = () => {
    if (days < 0) return `Terlambat ${Math.abs(days)} hari`;
    if (days === 0) return 'Hari ini';
    if (days === 1) return 'Besok';
    return `${days} hari lagi`;
  };

  return (
    <div className={`${styles.card} ${getCardClass()}`}>
      <div className={styles.cardRow}>
        <div className={styles.cardIcon}>
          {catInfo.emoji}
        </div>

        <div className={styles.cardInfo}>
          <div className={styles.cardName}>{subscription.name}</div>
          <div className={styles.cardMeta}>
            <span>{catInfo.label}</span>
            <span>·</span>
            <span>{fmtDate(subscription.nextDueDate)}</span>
            {subscription.isActive && (
              <>
                <span>·</span>
                <span className={`${styles.badge} ${getDueBadgeClass()}`}>
                  {getDueLabel()}
                </span>
              </>
            )}
          </div>
        </div>

        <div className={styles.cardRight}>
          <div>
            <div className={styles.cardAmount}>{fmtFull(subscription.amount)}</div>
            <div className={styles.cardCycle}>{cycleLabel}</div>
          </div>

          <span className={`${styles.badge} ${subscription.isActive ? styles.badgeActive : styles.badgeInactive}`}>
            {subscription.isActive ? 'Aktif' : 'Tidak Aktif'}
          </span>

          {subscription.isActive && (
            <button className={styles.payBtn} onClick={onPay}>
              Bayar
            </button>
          )}

          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={onEdit} title="Edit">
              <NavIcon name="edit" size={14} />
            </button>
            <button
              className={styles.actionBtn}
              onClick={onToggleActive}
              title={subscription.isActive ? 'Non-aktifkan' : 'Aktifkan'}
            >
              <NavIcon name={subscription.isActive ? 'close' : 'check'} size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
