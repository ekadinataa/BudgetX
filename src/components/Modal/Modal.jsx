import { Children, useEffect, useId, useRef } from 'react';
import NavIcon from '../icons/NavIcon';

/**
 * Modal — Fixed overlay dialog with backdrop blur, Escape key and backdrop click to close.
 *
 * @param {Object} props
 * @param {string} props.title - Header title text
 * @param {() => void} props.onClose - Callback invoked when the modal should close
 * @param {React.ReactNode} props.children - Modal body content
 * @param {number} [props.width=480] - Maximum width of the modal content in pixels
 */
export default function Modal({ title, onClose, children, width = 480 }) {
  const titleId = useId();
  const panelRef = useRef(null);
  // Simple forms finish with their save/delete buttons. Give those actions a
  // consistent footer without changing their callbacks or submission behavior.
  const content = Children.toArray(children);
  const footer = [];
  while (content.at(-1)?.type === 'button') footer.unshift(content.pop());

  useEffect(() => {
    const handler = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const controls = [...panelRef.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
      if (!controls.length) { e.preventDefault(); panelRef.current.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll so the page behind the overlay doesn't move, and move
  // focus into the dialog so keyboard users don't stay on the trigger.
  useEffect(() => {
    const prev = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="modal"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modalHead">
          <span className="modalTitle" id={titleId}>{title}</span>
          <button
            className="iconBtn"
            type="button"
            onClick={onClose}
            aria-label="Tutup"
          >
            <NavIcon name="close" size={18} />
          </button>
        </div>
        <div className="modalBody">
          {content}
          {footer.length > 0 && <div className="modalActions">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
