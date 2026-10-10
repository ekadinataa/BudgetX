import { fmtFull } from '../../utils/formatters';

/**
 * AmountText — Color-coded amount display with type prefix.
 *
 * Shows a formatted IDR amount with a prefix and color based on transaction type:
 * - income → green with "+" prefix
 * - expense → red with "-" prefix
 * - transfer → indigo with "↔" prefix
 *
 * @param {Object} props
 * @param {'income'|'expense'|'transfer'} props.type - Transaction type
 * @param {number} props.amount - Amount to display
 * @param {number} [props.size=14] - Font size in pixels
 *
 * Requirements: 4.9
 */
export default function AmountText({ type, amount, size = 14 }) {
  const colorMap = {
    income: 'var(--green-ink)',
    expense: 'var(--red-ink)',
    transfer: 'var(--indigo-ink)',
    adjustment: 'var(--gray-ink)',
  };

  const prefixMap = {
    income: '+',
    expense: '-',
    transfer: '↔',
    adjustment: amount < 0 ? '-' : '+',
  };

  const color = colorMap[type] || colorMap.expense;
  const prefix = prefixMap[type] || '-';

  return (
    <span
      style={{
        color,
        fontWeight: 600,
        fontSize: size,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {prefix}
      {fmtFull(type === 'adjustment' ? Math.abs(amount) : amount)}
    </span>
  );
}
