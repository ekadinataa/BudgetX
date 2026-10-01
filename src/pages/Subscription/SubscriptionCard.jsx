import { fmtFull, fmtDate } from '../../utils/formatters';
import { getDaysUntilDue } from '../../utils/subscriptionHelpers';
import { getSubscriptionCategoryInfo, getBillingCycleLabel } from '../../utils/subscriptionHelpers';
import NavIcon from '../../components/icons/NavIcon';

/**
 * SubscriptionCard — one subscription, on the reference's `recItem` family.
 *
 * `budgetx-app.html` uses the same `recList`/`recHead`/`recActions` structure
 * for recurring items, subscriptions and debts, so all three share these
 * classes here too. The due-date cue moved from a local `.cardSoon` /
 * `.cardOverdue` border to `recItemSoon` / `recItemUrgent`, and the due badge
 * from `.badgeSoon` / `.badgeOverdue` (both already in `base.css`).
 */
export default function SubscriptionCard({ subscription, onEdit, onPay, onToggleActive }) {
  const days = getDaysUntilDue(subscription.nextDueDate);
  const catInfo = getSubscriptionCategoryInfo(subscription.category);
  const cycleLabel = getBillingCycleLabel(subscription.billingCycle);

  const overdue = subscription.isActive && days < 0;
  const soon = subscription.isActive && days >= 0 && days <= 3;

  const dueLabel = () => {
    if (days < 0) return `terlambat ${Math.abs(days)} hari`;
    if (days === 0) return 'jatuh tempo hari ini';
    return `${days} hari lagi`;
  };

  return (
    <div
      className={`recItem${overdue ? ' recItemUrgent' : ''}${soon ? ' recItemSoon' : ''}`}
    >
      <div className="recHead">
        <span className="recIcon" aria-hidden="true">
          {catInfo.emoji}
        </span>
        <div className="recItemInfo">
          <div className="recItemName truncate">{subscription.name}</div>
          <div className="recItemMeta">
            <span>{catInfo.label}</span>
            <span>·</span>
            <span>{fmtDate(subscription.nextDueDate)}</span>
            {subscription.isActive && (
              <span className={overdue ? 'badge badgeOverdue' : soon ? 'badge badgeSoon' : 'badge badgeOk'}>
                {dueLabel()}
              </span>
            )}
            <span className={subscription.isActive ? 'badge badgeOk' : 'badge badgeInactive'}>
              {subscription.isActive ? 'Aktif' : 'Tidak Aktif'}
            </span>
          </div>
        </div>
        <div className="recItemAmount">
          <div className="recItemValue num">{fmtFull(subscription.amount)}</div>
          <div className="recItemSub">{cycleLabel}</div>
        </div>
      </div>

      <div className="recActions">
        {subscription.isActive && (
          <button className="btnSmallPrimary" onClick={onPay}>
            Bayar
          </button>
        )}
        <button className="btnSmallGhost" onClick={onEdit}>
          <NavIcon name="edit" size={14} /> Edit
        </button>
        <button className="btnSmallGhost" onClick={onToggleActive}>
          <NavIcon name={subscription.isActive ? 'close' : 'check'} size={14} />
          {subscription.isActive ? 'Non-aktifkan' : 'Aktifkan'}
        </button>
      </div>
    </div>
  );
}
