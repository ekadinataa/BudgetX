/**
 * TxBadge — Colored badge with Indonesian transaction type labels.
 *
 * Displays a small colored badge indicating the transaction type:
 * - income → green "Pemasukan"
 * - expense → red "Pengeluaran"
 * - transfer → indigo "Transfer"
 *
 * Uses CSS custom properties for theme-aware light/dark colors.
 *
 * @param {Object} props
 * @param {'income'|'expense'|'transfer'} props.type - Transaction type
 *
 * Requirements: 4.9
 */
export default function TxBadge({ type }) {
  const map = {
    income: {
      bg: 'var(--green-soft)',
      color: 'var(--green-ink)',
      label: 'Pemasukan',
    },
    expense: {
      bg: 'var(--red-soft)',
      color: 'var(--red-ink)',
      label: 'Pengeluaran',
    },
    transfer: {
      bg: 'var(--indigo-soft)',
      color: 'var(--indigo-ink)',
      label: 'Transfer',
    },
  };

  const s = map[type] || map.expense;

  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
}
