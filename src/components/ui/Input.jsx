/**
 * Input — styled text input with theme-aware borders.
 *
 * Accepts all standard <input> props plus:
 *   - `className` — merged in, so a caller can add a modifier (`.allocInput`,
 *     `.searchInput`, …)
 *   - `style`     — inline overrides, still supported
 *
 * `.inputField` owns geometry and theme. Toolbars inherit compact control
 * tokens; forms use the regular size; touch layouts keep 44px targets.
 */
export default function Input({ style, className = '', ...props }) {
  return (
    <input
      className={className ? `inputField ${className}` : 'inputField'}
      style={style}
      {...props}
    />
  );
}
