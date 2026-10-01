import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Id of the slot the Topbar renders. Kept here so both sides cannot drift. */
export const PAGE_ACTIONS_ID = 'page-actions-slot';

/**
 * usePageActions — render a page's header actions into the sticky Topbar.
 *
 * The reference's `pageHeader(title, sub, actions)` returns only the title and
 * subtitle; `actions` is rendered into `.topbarActions` in the bar itself, so
 * the page's primary buttons stay reachable while a long list scrolls.
 *
 * Implemented as a **portal**, not context + state. The obvious version —
 * `useState` in a provider, published from an effect — loops: the caller
 * passes a fresh JSX fragment on every render, so the effect's cleanup clears
 * the slot and the setup refills it, forever. A portal has no state and no
 * effect: the node lands in the DOM where the page already renders.
 *
 * @param {React.ReactNode} actions - Header actions
 * @returns {React.ReactNode} - portal to place anywhere in the page's output,
 *   or null before the Topbar has mounted (and in tests that render a page
 *   without a shell)
 */
export function usePageActions(actions) {
  const [host, setHost] = useState(null);

  useEffect(() => {
    // The slot is created by Topbar, a sibling that commits earlier in the
    // same pass, so it does not exist during this page's first render. The
    // trigger is the DOM, not state derived from render — the same category as
    // the fetchAllData() effect in App.jsx, which is also suppressed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(document.getElementById(PAGE_ACTIONS_ID));
  }, []);

  if (!host) return null;
  return createPortal(actions, host);
}
