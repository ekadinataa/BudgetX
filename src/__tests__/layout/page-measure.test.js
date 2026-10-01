import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV_GROUPS } from '../../components/Sidebar/Sidebar.jsx';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(resolve(SRC, ...p), 'utf-8');

const appSource = read('App.jsx');
const baseCss = read('styles', 'base.css');
const tokens = read('styles', 'tokens.css');
const dashboard = read('pages', 'Dashboard', 'Dashboard.jsx');

const ALL_PAGES = NAV_GROUPS.flatMap((g) => g.items);

/** Parse the `const PAGE_MEASURE = { ... }` literal out of App.jsx. */
function parsePageMeasure() {
  const start = appSource.indexOf('const PAGE_MEASURE = {');
  expect(start).toBeGreaterThan(-1);
  const body = appSource.slice(start, appSource.indexOf('};', start));
  const map = {};
  for (const m of body.matchAll(/(\w+):\s*'(\w+)'/g)) map[m[1]] = m[2];
  return map;
}

describe('per-page content width', () => {
  const measure = parsePageMeasure();

  it('gives every navigable page a width, except the dashboard', () => {
    // The dashboard is intentionally absent: it has its own two-column grid
    // and is the one page that wants the full container.
    expect(measure.dashboard).toBeUndefined();
    const missing = ALL_PAGES.filter((p) => p !== 'dashboard' && !measure[p]);
    expect(missing).toEqual([]);
  });

  it('only uses widths that are actually defined in the stylesheet', () => {
    const defined = new Set(['pageMeasure', 'pageWide']);
    for (const cls of Object.values(measure)) expect(defined).toContain(cls);
    for (const cls of defined) expect(baseCss).toContain(`.${cls} {`);
  });

  it('narrows with min() so a small window can never overflow', () => {
    // `max-width: 1360px` alone would be wider than --container-max on a
    // laptop; min() keeps the container cap in charge.
    expect(baseCss).toMatch(/\.pageMeasure\s*\{\s*max-width:\s*min\(\s*920px,\s*var\(--container-max\)\s*\)/);
    expect(baseCss).toMatch(/\.pageWide\s*\{\s*max-width:\s*min\(\s*1360px,\s*var\(--container-max\)\s*\)/);
  });

  it('keeps long-form pages on the narrow readable measure', () => {
    // fire is a long form and help is prose; both are unreadable at 1360px.
    for (const p of ['help', 'fire']) {
      expect(measure[p]).toBe('pageMeasure');
    }
  });

  it('gives Settings the wide measure because its cards go two-up', () => {
    // Settings is a stack of seven short cards. At .pageMeasure it left ~47%
    // of a 2000px display empty and ran very long; .cardCols pairs them up,
    // and each card's own form rows stay short enough to read.
    expect(measure.settings).toBe('pageWide');
    expect(baseCss).toMatch(/\.cardCols \{ display: grid;/);
    expect(baseCss).toMatch(
      /@media \(width >= 1240px\) \{\s*\.cardCols \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(read('pages', 'Settings', 'SettingsPage.jsx')).toContain('className="cardCols"');
  });

  it('gives the data pages the wide measure', () => {
    for (const p of ['tx', 'report', 'wallet', 'asset', 'budget', 'debt', 'invest']) {
      expect(measure[p]).toBe('pageWide');
    }
  });
});

describe('wide-viewport container', () => {
  it('raises the cap instead of leaving the content in a narrow centred column', () => {
    // The reference pins 1180px, which wastes ~32% of a 2000px display. These
    // steps only ever raise the ceiling, and `.container` is `width: 100%`, so
    // a narrower window just falls back to the smaller cap.
    expect(tokens).toContain('--container-max: 1180px');
    const steps = [...baseCss.matchAll(/@media \(width >= (\d+)px\) \{ :root \{ --container-max: (\d+)px; \} \}/g)];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    // Monotonically increasing, and each wider than the 1180px floor.
    const widths = steps.map((m) => +m[1]);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    for (const m of steps) expect(+m[2]).toBeGreaterThan(1180);
    expect(baseCss).toMatch(/\.container \{\s*width: 100%; max-width: var\(--container-max\)/);
  });
});

describe('dashboard column balance', () => {
  /** Split the dashboard body at its two `.col` wrappers. */
  function columns() {
    const start = dashboard.indexOf('className="mainGrid"');
    const parts = dashboard.slice(start).split('<div className="col">');
    return { left: parts[1], right: parts[2] };
  }

  it('keeps the wide transaction list out of the narrow rail', () => {
    // "Transaksi Terbaru" was in the right rail, which made the left column
    // 501px tall against the right's 1202px and left the page visibly lopsided.
    // Transaction rows are the widest content here, so they belong left.
    const { left, right } = columns();
    expect(left).toContain('Transaksi Terbaru');
    expect(right).not.toContain('Transaksi Terbaru');
  });

  it('puts the reference sections in the expected column', () => {
    const { left, right } = columns();
    expect(left).toContain('Aksi Cepat');
    expect(left).toContain('Budget ');
    expect(right).toContain('Skor Kesehatan Keuangan');
    expect(right).toContain('Rekomendasi');
    expect(right).toContain('Ringkasan Kekayaan');
  });

  it('makes the rail sticky only where two columns actually fit', () => {
    expect(baseCss).toContain('.mainGrid > .col:last-child {');
    expect(baseCss).toMatch(
      /@media \(width <= 1023px\) \{[^}]*\.mainGrid > \.col:last-child \{ position: static;/,
    );
  });
});
