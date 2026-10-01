import { useState, useRef, useEffect } from 'react';

const SECTION_LABELS = {
  needs: 'Kebutuhan',
  wants: 'Keinginan',
  savings: 'Tabungan',
  income: 'Pemasukan',
};
const SECTION_ORDER = ['needs', 'wants', 'savings', 'income'];

/**
 * CategoryPicker — Custom dropdown with emoji grid for selecting a category.
 *
 * Shows a trigger button with the selected category (color dot + name).
 * When clicked, opens a dropdown panel with a 4-column emoji grid grouped by section.
 *
 * @param {Object} props
 * @param {Array} props.categories - Filtered categories (already filtered by tx type)
 * @param {string} props.value - Selected category ID
 * @param {(e: {target: {value: string}}) => void} props.onChange - Callback when category is selected
 */
export default function CategoryPicker({ categories, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus search when opened
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const selected = categories.find((c) => c.id === value);
  const filtered = search
    ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  // Group by section
  const grouped = {};
  for (const sec of SECTION_ORDER) {
    const items = filtered
      .filter((c) => c.section === sec)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    if (items.length > 0) grouped[sec] = items;
  }

  const handleSelect = (id) => {
    onChange({ target: { value: id } });
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="categoryPicker" ref={containerRef}>
      {/* Trigger button */}
      <button type="button" className="inputField categoryPickerTrigger" aria-expanded={open} onClick={() => setOpen(!open)}>
        {selected && <span className="categoryPickerDot" style={{ background: selected.color }} />}
        <span className="categoryPickerText">{selected?.name || 'Pilih kategori'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="categoryPickerDropdown">
          <div className="categoryPickerSearchWrap">
            <input
              ref={searchRef}
              type="text"
              className="categoryPickerSearch"
              placeholder="Cari kategori..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="categoryPickerList">
            {Object.keys(grouped).length === 0 && (
              <div className="categoryPickerEmpty">Tidak ditemukan</div>
            )}
            {Object.entries(grouped).map(([sec, items]) => (
              <div key={sec}>
                <div className="categoryPickerSection">{SECTION_LABELS[sec]}</div>
                <div className="categoryPickerGrid">
                  {items.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="categoryPickerItem"
                      aria-pressed={cat.id === value}
                      onClick={() => handleSelect(cat.id)}
                    >
                      <span
                        className="categoryPickerCircle"
                        style={{
                          background: cat.color + '26',
                          borderColor: cat.id === value ? cat.color : 'transparent',
                        }}
                      >
                        {cat.icon || cat.name.charAt(0)}
                      </span>
                      <span className="categoryPickerLabel">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
