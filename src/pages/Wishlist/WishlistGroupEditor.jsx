import { useId } from 'react';

export default function WishlistGroupEditor({ draft, onChange, onSubmit, onCancel, pending, editing = false }) {
  const prefix = useId();
  const renderField = (name, label, type = 'text') => (
    <div className="field">
      <label className="inputLabel" htmlFor={`${prefix}-${name}`}>{label}</label>
      <input
        className="inputField"
        id={`${prefix}-${name}`}
        type={type}
        maxLength={1000}
        required
        autoFocus={name === 'title'}
        data-autofocus={name === 'title' ? true : undefined}
        value={draft[name]}
        onChange={event => onChange(name, event.target.value)}
        {...(type === 'number' ? { min: 1, step: 1, max: Number.MAX_SAFE_INTEGER, inputMode: 'numeric' } : {})}
      />
    </div>
  );

  return (
    <form className="wishlistEditor" noValidate onSubmit={onSubmit}>
      <p className="wishlistEditorIntro">Satu kelompok untuk satu rencana. Tentukan judul dan nominal target dana Anda.</p>
      <fieldset className="wishlistFields" disabled={pending}>
        {renderField('title', 'Judul wishlist')}
        {renderField('targetBudget', 'Target dana (Rp)', 'number')}
        <details className="wishlistSchedule" open={!editing}>
          <summary
            tabIndex={0}
            aria-disabled={Boolean(pending)}
            onClick={event => { if (pending) event.preventDefault(); }}
            onKeyDown={event => {
              if (pending && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
            }}
          >Jadwal target</summary>
          {renderField('targetDate', 'Tanggal target', 'date')}
        </details>
        <div className="modalActions">
          <button type="button" className="btnGhost" onClick={onCancel} disabled={pending}>Batal</button>
          <button type="submit" className="btnPrimary" disabled={pending}>{editing ? 'Simpan Perubahan' : 'Simpan Wishlist'}</button>
        </div>
      </fieldset>
    </form>
  );
}
