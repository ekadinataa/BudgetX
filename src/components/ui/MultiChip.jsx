/**
 * MultiChip — Multi-select filter using clickable chips/pills.
 *
 * Shows an "All" chip plus one chip per option. Clicking toggles selection.
 * When all are deselected or "All" is clicked, it resets to show everything.
 *
 * @param {Object} props
 * @param {{ value: string, label: string, color?: string }[]} props.options
 * @param {Set<string>} props.selected - Set of selected values (empty = all)
 * @param {(selected: Set<string>) => void} props.onChange
 * @param {string} [props.allLabel='Semua'] - Label for the "all" chip
 */
export default function MultiChip({ options, selected, onChange, allLabel = 'Semua' }) {
  const allSelected = selected.size === 0;

  const toggle = (val) => {
    const next = new Set(selected);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    // If all options are now selected, reset to empty (= all)
    if (next.size === options.length) {
      onChange(new Set());
    } else {
      onChange(next);
    }
  };

  const selectAll = () => onChange(new Set());

  return (
    <div className="chipGroup">
      <button
        type="button"
        className="filterChip"
        aria-pressed={allSelected}
        onClick={selectAll}
      >
        {allLabel}
      </button>
      {options.map((opt) => {
        const active = selected.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            className="filterChip"
            aria-pressed={active}
            onClick={() => toggle(opt.value)}
          >
            {opt.color && <span className="dot" style={{ background: opt.color }} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
