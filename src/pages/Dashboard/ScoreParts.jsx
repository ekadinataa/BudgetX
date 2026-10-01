import NavIcon from '../../components/icons/NavIcon';

/**
 * ScoreDonut — circular financial-health score.
 *
 * Matches the reference: `.scoreCircle` is a 104px box and the SVG is
 * rotated -90deg in CSS so the arc starts at twelve o'clock. The
 * circumference for r=50 is 2πr ≈ 314.16; `strokeDashoffset` scales that by
 * the score. Keeping the rotation in CSS (not an SVG transform attribute)
 * matters because `.scoreCircle svg` is the selector the reference uses.
 *
 * @param {Object} props
 * @param {number} props.score - 0–100
 * @param {string} [props.inkColor] - Numeral colour. Pass `grade.ink` from
 *   `computeHealthRatios`; `--orange` is only 2.15:1 on white even at 28px.
 * @param {string} [props.color] - Arc colour. Pass `grade.ring` from
 *   `computeHealthRatios` so the ring and the grade pill cannot disagree.
 */
export default function ScoreDonut({ score, size = 104, stroke = 10, color, inkColor }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);

  // `ring` paints the 10px arc; the numeral needs the darker text-safe variant
  // because --orange on white is only 2.15:1 even at 28px bold. Callers pass
  // both from `grade`.
  const ring =
    color ?? (score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--green)' : score >= 40 ? 'var(--orange)' : 'var(--red)');
  const ink =
    inkColor ?? (score >= 80 ? 'var(--green-ink)' : score >= 60 ? 'var(--green-ink)' : score >= 40 ? 'var(--orange-ink)' : 'var(--red-ink)');

  return (
    <div className="scoreCircle" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--fill-tertiary)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={ring} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div className="scoreCenter">
        <span className="scoreNumber num" style={{ color: ink }}>{Math.round(score)}</span>
        <span className="scoreLabel">dari 100</span>
      </div>
    </div>
  );
}

/**
 * RatioBar — a labelled progress row for one financial-health ratio.
 * `value` is a pre-formatted string; `pct` is the fill in 0–100.
 */
export function RatioBar({ label, value, pct }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="ratioRow">
      <div className="ratioHead">
        <span className="ratioName">{label}</span>
        <span className="ratioValue num">{value}</span>
      </div>
      <div className="ratioBar">
        <div className="ratioBarFill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/** Section heading with an optional leading icon, as used by the reference. */
/**
 * SectionTitle — card heading.
 *
 * Two shapes, matching the reference:
 *   - default: a bare `<h2 class="sectionTitle">` (uppercase, `--label-2`).
 *     Used for Aksi Cepat, Skor Kesehatan, Rekomendasi, Ringkasan Kekayaan.
 *   - `variant="card"`: wraps in `.cardHead` so a `.cardTitle` can sit
 *     alongside a subtitle and a trailing action button. Used by Budget and
 *     Transaksi Terbaru.
 */
export function SectionTitle({ icon, children, action, variant }) {
  const heading = (
    <>
      {icon && <NavIcon name={icon} size={14} />}
      {children}
    </>
  );

  if (variant === 'card') {
    return (
      <div className="cardHead">
        <h2 className="cardTitle">{heading}</h2>
        {action}
      </div>
    );
  }

  return (
    <div className="cardHead" style={{ marginBottom: 'var(--s3)' }}>
      <h2 className="sectionTitle" style={{ margin: 0 }}>{heading}</h2>
      {action}
    </div>
  );
}
