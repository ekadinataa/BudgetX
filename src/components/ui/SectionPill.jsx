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

/** Background colors per section (light theme defaults) */
const bgMap = {
  needs: 'var(--section-pill-needs-bg, rgba(99, 102, 241, 0.08))',
  wants: 'var(--section-pill-wants-bg, rgba(245, 158, 11, 0.08))',
  savings: 'var(--section-pill-savings-bg, rgba(22, 163, 74, 0.08))',
};

/** Foreground colors per section (light theme defaults) */
const fgMap = {
  needs: 'var(--section-pill-needs-color, #4338CA)',
  wants: 'var(--section-pill-wants-color, #854D0E)',
  savings: 'var(--section-pill-savings-color, #166534)',
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
