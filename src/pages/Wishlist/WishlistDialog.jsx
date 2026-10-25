import { createPortal } from 'react-dom';
import { useEffect, useEffectEvent, useId, useRef } from 'react';
import NavIcon from '../../components/icons/NavIcon';

const focusable = root => [...root.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]')].filter(el => {
  if (el.matches(':disabled, input[type="hidden"]') || el.tabIndex < 0 || el.closest('[hidden]') || el.getAttribute('aria-disabled') === 'true') return false;
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent.matches('details:not([open])') && !parent.querySelector(':scope > summary')?.contains(el)) return false;
  }
  return true;
});
const focusInitial = root => {
  const controls = focusable(root);
  (controls.find(el => el.hasAttribute('data-autofocus')) || controls[0] || root).focus();
};

/** Wishlist-scoped dialog: no behavioral changes to the application's shared Modal. */
export default function WishlistDialog({ title, onClose, children, footer, headerActions, fallbackFocusRef, pending = false }) {
  const titleId = useId();
  const root = useRef(null);
  const close = useEffectEvent(() => { if (!pending) onClose(); });
  useEffect(() => {
    const previousFocus = document.activeElement;
    const fallbackFocus = fallbackFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFirst = () => focusInitial(root.current);
    focusFirst();
    const background = [...document.body.children].filter(el => !el.contains(root.current)).map(el => ({ el, inert: el.getAttribute('inert'), hidden: el.getAttribute('aria-hidden') }));
    for (const { el } of background) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== 'Tab') return;
      const controls = focusable(root.current);
      const first = controls[0], last = controls.at(-1);
      if (!controls.length) { event.preventDefault(); root.current.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !root.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const onFocus = event => { if (!root.current.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      document.body.style.overflow = previousOverflow;
      for (const { el, inert, hidden } of background) {
        if (inert === null) el.removeAttribute('inert'); else el.setAttribute('inert', inert);
        if (hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', hidden);
      }
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus();
      else fallbackFocus?.focus();
    };
  }, [fallbackFocusRef]);
  useEffect(() => {
    // Editors and confirmation views replace controls without nesting dialogs.
    if (!root.current.contains(document.activeElement) || document.activeElement === root.current) focusInitial(root.current);
  }, [title]);
  return createPortal(<div className="overlay wishlistOverlay" onClick={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section ref={root} tabIndex={-1} className="modal wishlistDialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={pending}>
      <header className="modalHead"><h2 id={titleId} className="modalTitle">{title}</h2><div className="wishlistActions"><button type="button" className="iconBtn" aria-label="Tutup" disabled={pending} onClick={onClose}><NavIcon name="close" /></button>{headerActions}</div></header>
      <div className="modalBody wishlistBody">{pending && <p role="status">Memproses wishlist…</p>}{children}</div>
      {footer}
    </section>
  </div>, document.body);
}
