import styles from './Dashboard.module.css';

/**
 * StatCard — Dashboard stat card with accent circle, label, value, subtitle, and optional detail.
 *
 * @param {Object} props
 * @param {string} props.label - Uppercase label text
 * @param {string} props.value - Main formatted value
 * @param {string} props.sub - Subtitle text
 * @param {string} props.accent - Accent hex color
 * @param {string} props.icon - Icon name (unused visually, kept for API compat)
 * @param {string} [props.detail] - Optional detail line in accent color
 *
 * Requirements: 6.1
 */
export default function StatCard({ label, value, sub, accent, detail }) {
  return (
    <div className={styles.card} style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        className={styles.statAccentCircle}
        style={{ background: accent + '12' }}
      />
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statSub}>{sub}</div>
      {detail && (
        <div className={styles.statDetail} style={{ color: accent }}>
          {detail}
        </div>
      )}
    </div>
  );
}
