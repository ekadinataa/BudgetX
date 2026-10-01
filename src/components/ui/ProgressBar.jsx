/**
 * ProgressBar — Animated bar with overflow indication.
 *
 * Displays a horizontal progress bar that fills based on value/max ratio.
 * When showOverflow is true and value exceeds max, the bar turns red.
 *
 * @param {Object} props
 * @param {number} props.value - Current value
 * @param {number} props.max - Maximum value (determines 100% width)
 * @param {string} [props.color='var(--blue-ink)'] - Bar fill color
 * @param {number} [props.height=6] - Bar height in pixels
 * @param {boolean} [props.showOverflow=false] - When true, bar turns red if value > max
 *
 * Requirements: 5.4
 */
export default function ProgressBar({
  value,
  max,
  color = 'var(--blue-ink)',
  height = 6,
  showOverflow = false,
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const overflow = max > 0 && value > max;
  const barColor = showOverflow && overflow ? 'var(--red)' : color;

  return (
    <div
      style={{
        background: 'var(--bg-3)',
        borderRadius: 99,
        height,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: barColor,
          borderRadius: 99,
          transition: 'width 0.8s ease-out',
        }}
      />
    </div>
  );
}
