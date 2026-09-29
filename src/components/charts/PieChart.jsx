import { fmt } from '../../utils/formatters';

/**
 * PieChart — Donut pie chart with center total label.
 *
 * Renders an SVG donut chart from an array of slices. Each slice is drawn as
 * an arc segment with a white stroke separator. The center displays the total.
 *
 * @param {Object} props
 * @param {{ label: string, value: number, color: string }[]} props.slices - Data slices
 * @param {number} [props.size=180] - SVG width and height in pixels
 *
 * Requirements: 7.2
 */
export default function PieChart({ slices, size = 180 }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-6)', fontSize: 13 }}>
        Tidak ada data
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const inner = r * 0.55;
  const TAU = Math.PI * 2;

  // Accumulate start angles without mutating a render-scope variable.
  const segments = slices.reduce((acc, s) => {
    const prev = acc[acc.length - 1];
    const startAngle = prev ? prev.startAngle + prev.sweep : -Math.PI / 2;
    acc.push({ color: s.color, startAngle, sweep: (s.value / total) * TAU });
    return acc;
  }, []);

  const paths = segments.map(({ color, startAngle, sweep: a }) => {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle + a);
    const y2 = cy + r * Math.sin(startAngle + a);
    const xi1 = cx + inner * Math.cos(startAngle);
    const yi1 = cy + inner * Math.sin(startAngle);
    const xi2 = cx + inner * Math.cos(startAngle + a);
    const yi2 = cy + inner * Math.sin(startAngle + a);
    const large = a > Math.PI ? 1 : 0;
    const d = `M${xi1},${yi1} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} L${xi2},${yi2} A${inner},${inner},0,${large},0,${xi1},${yi1}Z`;
    return { d, color };
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={size} height={size}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="2" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="var(--text-5)">
          Total
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-1)">
          {fmt(total)}
        </text>
      </svg>
    </div>
  );
}
