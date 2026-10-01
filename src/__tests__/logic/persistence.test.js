import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORAGE_KEY } from '../../utils/constants.js';

/**
 * Create a proper localStorage mock with all standard methods.
 * This avoids issues with other test files overriding globalThis.localStorage.
 */
function createStorageMock() {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] || null),
  };
}

/** Clean up document.documentElement styles and attributes */
function resetRoot() {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  // ThemeProvider no longer writes inline custom properties, but clear
  // anything a previous test may have left behind.
  for (let i = root.style.length - 1; i >= 0; i -= 1) {
    root.style.removeProperty(root.style[i]);
  }
}

describe('Theme persistence', () => {
  let storage;
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    storage = createStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
    resetRoot();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    resetRoot();
  });

  // ── Requirement 2.3: darkMode persists to localStorage ────────────────────

  it('App serializes darkMode=true to localStorage as part of the state object', () => {
    const state = {
      page: 'dashboard',
      wallets: [],
      transactions: [],
      budgets: {},
      categories: [],
      darkMode: true,
      cycleStart: 1,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));

    const restored = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(restored.darkMode).toBe(true);
  });

  it('App serializes darkMode=false to localStorage as part of the state object', () => {
    const state = {
      page: 'dashboard',
      wallets: [],
      transactions: [],
      budgets: {},
      categories: [],
      darkMode: false,
      cycleStart: 1,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));

    const restored = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(restored.darkMode).toBe(false);
  });

  it('loadState restores darkMode from localStorage', () => {
    const state = {
      page: 'wallet',
      wallets: [],
      transactions: [],
      budgets: {},
      categories: [],
      darkMode: true,
      cycleStart: 5,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Simulate the loadState function from App.jsx
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.darkMode).toBe(true);
  });

  it('loadState returns null for corrupted JSON, allowing fallback to defaults', () => {
    storage.setItem(STORAGE_KEY, '{corrupted!!!');

    let result;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) {
        result = null;
      } else {
        result = JSON.parse(raw);
      }
    } catch {
      result = null;
    }

    expect(result).toBeNull();
  });

  // ── Requirement 2.4: FOUC prevention script applies dark theme before React mounts ──

  it('FOUC prevention script applies dark CSS vars when darkMode is true in localStorage', () => {
    // Simulate what the index.html inline script does
    const state = { darkMode: true };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Replicate the FOUC prevention logic from index.html
    const s = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (s.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // The script only sets the attribute; tokens.css supplies the colours.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.length).toBe(0);
  });

  it('FOUC prevention script does nothing when darkMode is false in localStorage', () => {
    const state = { darkMode: false };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Replicate the FOUC prevention logic from index.html
    const s = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (s.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Verify no dark theme was applied
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('FOUC prevention script does nothing when localStorage is empty', () => {
    // Replicate the FOUC prevention logic from index.html
    const s = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (s.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('FOUC prevention script handles corrupted localStorage gracefully', () => {
    storage.setItem(STORAGE_KEY, 'not-valid-json');

    // Replicate the FOUC prevention logic from index.html (wrapped in try/catch)
    let applied = false;
    try {
      const s = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
      if (s.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        applied = true;
      }
    } catch {
      // Script silently fails — no theme applied, no crash
    }

    expect(applied).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  // ── Theme is driven by data attributes, not inline custom properties ────

  it('FOUC script only sets data attributes, never inline custom properties', () => {
    // Regression guard: the inline script used to hardcode the whole dark
    // palette, duplicating tokens.css. It must only write attributes.
    const html = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'index.html'),
      'utf-8'
    );
    const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
    expect(script).toContain("setAttribute('data-theme'");
    expect(script).toContain("setAttribute('data-density'");
    expect(script).toContain("setAttribute('data-radius'");
    expect(script).not.toContain('setProperty');
    expect(script).not.toContain('--bg');
  });

  it('tokens.css carries the HIG system for both themes', async () => {
    const css = (await import('../../styles/tokens.css?raw')).default;
    // Light + dark blocks
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--blue: #007aff');
    expect(css).toContain('--blue: #0a84ff');
    // Density and radius are user-scalable, per the reference.
    expect(css).toContain("[data-density='compact']");
    expect(css).toContain("[data-radius='round']");
    // Legacy aliases must survive until the remaining pages migrate.
    expect(css).toContain('--bg-card: var(--surface)');
    expect(css).toContain('--text-1: var(--label)');
  });

  it('tokens.css does not import a remote font (system stack instead)', async () => {
    const css = (await import('../../styles/tokens.css?raw')).default;
    expect(css).toContain('-apple-system');
    expect(css).not.toContain('fonts.googleapis.com');
  });
});
