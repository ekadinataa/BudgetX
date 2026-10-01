/**
 * Application constants for BudgetX Money Tracker
 */

/** Wallet type options for forms and display */
export const WALLET_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'credit', label: 'Kartu Kredit' },
  { value: 'paylater', label: 'PayLater' },
  { value: 'cash', label: 'Tunai/Cash' },
];

/** localStorage key for persisting application state */
export const STORAGE_KEY = 'budgetku_state';

/**
 * Theme colours are NOT defined here.
 *
 * They used to be, but the same palette had to be duplicated in three places
 * (this file, App.css, and the FOUC script in index.html) and they drifted.
 * The stylesheet is now the single source of truth:
 *   - light + shared tokens → src/styles/tokens.css, `:root`
 *   - dark overrides         → src/styles/tokens.css, `:root[data-theme="dark"]`
 *
 * ThemeContext only toggles the `data-theme` attribute; nothing injects
 * inline custom properties any more.
 */

/** Budget section metadata: label, and the 50/30/20 guideline percentage. */
export const BUDGET_SECTIONS = [
  { key: 'needs', label: 'Kebutuhan', guideline: 50 },
  { key: 'wants', label: 'Keinginan', guideline: 30 },
  { key: 'savings', label: 'Tabungan', guideline: 20 },
];
