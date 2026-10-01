import { sectionLabel } from '../../utils/helpers';

/**
 * SectionPill — Colored pill with budget section label.
 *
 * Displays a small colored pill indicating the budget section:
 * - needs → indigo "Kebutuhan"
 * - wants → amber "Keinginan"
 * - savings → green "Tabungan"
 *
 * Uses sectionLabel() and sectionColor() helpers for label and color mapping.
 *
 * @param {Object} props
 * @param {'needs'|'wants'|'savings'} props.section - Budget section
 *
 * Requirements: 5.4
 */

/** Tinted background per budget section. */
const bgMap = {
  needs: 'var(--indigo-soft)',
  wants: 'var(--orange-soft)',
  savings: 'var(--green-soft)',
};

/** Text-safe foreground per budget section. */
const fgMap = {
  needs: 'var(--indigo-ink)',
  wants: 'var(--orange-ink)',
  savings: 'var(--green-ink)',
};

export default function SectionPill({ section }) {
  return (
    <span
      style={{
        background: bgMap[section] || 'var(--bg-3)',
        color: fgMap[section] || 'var(--text-3)',
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {sectionLabel(section)}
    </span>
  );
}
