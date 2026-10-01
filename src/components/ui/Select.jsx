/**
 * Select — styled select with theme-aware borders.
 *
 * Accepts all standard <select> props plus:
 *   - `className` — merged in, so a caller can add a modifier
 *   - `style`     — inline overrides, still supported
 *
 * `.inputField` supplies the same contextual geometry as Input. Additional
 * classes can override it without competing against hardcoded inline defaults.
 */
export default function Select({ style, className = '', children, ...props }) {
  return (
    <select
      className={className ? `inputField ${className}` : 'inputField'}
      style={style}
      {...props}
    >
      {children}
    </select>
  );
}
