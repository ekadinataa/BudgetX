/** Page actions now sit beside the page title, as in the approved reference.
 * Keep existing call sites and callbacks without effect-driven publishing.
 */
export function usePageActions(actions) {
  return actions ? <div className="pageActions">{actions}</div> : null;
}
