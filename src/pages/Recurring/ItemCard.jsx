import { fmtFull, fmt } from '../../utils/formatters';
import { getAmortizedMonthlyCost, formatDaysRemaining, formatDuration } from '../../utils/recurring';
import NavIcon from '../../components/icons/NavIcon';

/**
 * ItemCard — one recurring item.
 *
 * Built on the reference's `recItem` family (`recList`/`recHead`/`recIcon`/
 * `recItemInfo`/`recItemValue`/`recActions`), which `budgetx-app.html` shares
 * between the recurring, subscription and debt pages. The urgency cue moved
 * from a coloured border on a local `.cardUrgent` to `recItemUrgent` /
 * `recItemSoon` — an inset shadow, the reference's own treatment.
 *
 * @param {Object} props
 * @param {Object} props.item - Recurring item, with `_daysLeft` precomputed
 * @param {Function} props.getCat - Category lookup
 * @param {boolean} [props.urgent] - Needs restocking
 * @param {boolean} [props.inactive] - Row is not being tracked
 * @param {Function} props.onEdit
 * @param {Function} props.onToggleActive
 * @param {Function} [props.onRepurchase] - Renders the "Sudah Beli" button
 */
export default function ItemCard({
  item,
  getCat,
  urgent,
  inactive,
  onEdit,
  onRepurchase,
  onToggleActive,
}) {
  const cat = getCat(item.categoryId);
  const amortized = getAmortizedMonthlyCost(item.amount, item.durationDays);
  const daysLeft = item._daysLeft;

  const soon = !inactive && daysLeft !== undefined && daysLeft > 0 && daysLeft <= 7;

  return (
    <div
      className={`recItem${urgent ? ' recItemUrgent' : ''}${soon ? ' recItemSoon' : ''}`}
    >
      <div className="recHead">
        {/* The tint comes from the category's stored colour, which is arbitrary
            user data — it can be any hue, so it stays decorative. The letter
            itself uses --label: a user-picked pastel as body text would be
            unreadable, and we cannot darken the stored value at render time
            without changing what is persisted. */}
        <span
          className="recIcon"
          style={{
            background: `color-mix(in srgb, ${cat?.color || 'var(--gray)'} 16%, transparent)`,
          }}
          aria-hidden="true"
        >
          {item.name.charAt(0).toUpperCase()}
        </span>

        <div className="recItemInfo">
          <div className="recItemName truncate">{item.name}</div>
          <div className="recItemMeta">
            <span>{cat?.name || '—'}</span>
            <span>·</span>
            <span>{formatDuration(item.durationDays)}</span>
            {item.note && (
              <>
                <span>·</span>
                <span className="truncate">{item.note}</span>
              </>
            )}
            {inactive && <span className="badge badgeInactive">Non-aktif</span>}
            {!inactive && daysLeft !== undefined && (
              <span
                className={
                  daysLeft <= 0 ? 'badge badgeOverdue' : soon ? 'badge badgeSoon' : 'badge badgeOk'
                }
              >
                {formatDaysRemaining(daysLeft)}
              </span>
            )}
          </div>
        </div>

        <div className="recItemAmount">
          <div className="recItemValue num">{fmtFull(item.amount)}</div>
          <div className="recItemSub num">{fmt(Math.round(amortized))}/bln</div>
        </div>
      </div>

      <div className="recActions">
        {!inactive && onRepurchase && (
          <button className="btnSmallPrimary" onClick={onRepurchase}>
            Sudah Beli
          </button>
        )}
        <button className="btnSmallGhost" onClick={onEdit}>
          <NavIcon name="edit" size={14} /> Edit
        </button>
        <button className="btnSmallGhost" onClick={onToggleActive}>
          <NavIcon name={inactive ? 'check' : 'close'} size={14} />
          {inactive ? 'Aktifkan' : 'Non-aktifkan'}
        </button>
      </div>
    </div>
  );
}
