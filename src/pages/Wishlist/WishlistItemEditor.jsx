import { useId } from 'react';

export default function WishlistItemEditor({ draft, onChange, onSubmit, onCancel, pending, groupTitle }) {
  const prefix = useId();
  const renderField = (name, label, type = 'text') => (
    <div className="field">
      <label className="inputLabel" htmlFor={`${prefix}-${name}`}>{label}</label>
      <input
        className="inputField"
        id={`${prefix}-${name}`}
        type={type}
        maxLength={1000}
        required={name === 'name' || name === 'price'}
        autoFocus={name === 'name'}
        data-autofocus={name === 'name' ? true : undefined}

        value={draft[name]}
        onChange={event => onChange(name, event.target.value)}
        {...(type === 'number' ? { min: 1, step: 1, max: Number.MAX_SAFE_INTEGER, inputMode: 'numeric' } : {})}
      />
    </div>
  );

  return (
    <form className="wishlistEditor" noValidate onSubmit={onSubmit}>
      {groupTitle && <p className="wishlistEditorIntro">Wishlist: <strong>{groupTitle}</strong></p>}
      <fieldset className="wishlistFields" disabled={pending}>
        {renderField('name', 'Nama item')}
        <div className="wishlistFieldPair">
          {renderField('price', 'Harga (Rp)', 'number')}
          <div className="field">
            <label className="inputLabel" htmlFor={`${prefix}-priority`}>Urgensi / prioritas</label>
            <select className="inputField" id={`${prefix}-priority`} value={draft.priority} onChange={event => onChange('priority', event.target.value)}>
              <option value="high">Tinggi</option>
              <option value="medium">Sedang</option>
              <option value="low">Rendah</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="inputLabel" htmlFor={`${prefix}-notes`}>Catatan (opsional)</label>
          <textarea className="inputField wishlistNotesInput" id={`${prefix}-notes`} rows={3} maxLength={1000} value={draft.notes ?? ''} onChange={event => onChange('notes', event.target.value)} />
        </div>
        <div className="modalActions">
          <button type="button" className="btnGhost" onClick={onCancel} disabled={pending}>Batal</button>
          <button type="submit" className="btnPrimary" disabled={pending}>Simpan Item</button>
        </div>
      </fieldset>
    </form>
  );
}
