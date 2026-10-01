/**
 * Field — Form field wrapper with label and optional error message.
 *
 * Wraps form inputs with a styled label and displays validation errors in red.
 *
 * @param {Object} props
 * @param {string} props.label - Field label text
 * @param {React.ReactNode} props.children - Form input element(s)
 * @param {string} [props.error] - Optional error message displayed in red below the field
 *
 * Requirements: 9.5
 */
export default function Field({ label, children, error }) {
  return (
    <div className="field">
      <label className="inputLabel">
        {label}
      </label>
      {children}
      {error && (
        <div className="fieldError" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
