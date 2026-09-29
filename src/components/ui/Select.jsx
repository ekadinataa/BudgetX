/**
 * Select — Styled select with theme-aware borders.
 *
 * Uses CSS custom properties (--bg-card, --border, --text-1) for theme awareness.
 * Accepts all standard <select> props plus an optional style override.
 *
 * @param {Object} props - Standard HTML select props
 * @param {Object} [props.style] - Optional inline style overrides
 * @param {React.ReactNode} props.children - <option> elements
 *
 * Requirements: 9.5
 */
export default function Select({ style, children, ...props }) {
  return (
    <select
      style={{
        width: '100%',
        padding: '10px 12px',
        border: '1px solid var(--border)',
        borderRadius: 12,
        fontSize: 14,
        color: 'var(--text-1)',
        background: 'var(--bg-2)',
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.2s',
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  );
}
