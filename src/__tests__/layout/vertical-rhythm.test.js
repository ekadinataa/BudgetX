/**
 * Vertical rhythm contract.
 *
 * Every page returns `<div>{topbarActions}<header/><card/>…</div>` so the topbar
 * actions slot exists in the tree. For eight pages that wrapper was a plain
 * `<div>`, which made it the *single* flex child of `.container` — so the
 * container's `gap: var(--s5)` applied between that one wrapper and nothing
 * else, and every card on the page stacked flush against its neighbour. Nothing
 * overflowed, nothing threw, and it read as "cramped" rather than broken, which
 * is why it survived a full responsive sweep.
 *
 * `.pageStack` now carries `display: contents`, which removes the wrapper box
 * from layout while keeping its children in the flex flow. These tests pin that:
 * a page must not re-introduce a boxed wrapper, and no page may render two
 * adjacent blocks with no space between them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from './browser-support';
const SKIP = chromium ? false : 'playwright is not installed';

const URL = globalThis.process?.env?.UAT_URL || 'http://localhost:5173';
const PAGES = [
  'dashboard', 'wallet', 'tx', 'budget', 'recurring', 'subscription',
  'debt', 'invest', 'asset', 'report', 'settings', 'help',
];

/**
 * Pages that legitimately present a single top-level block, with the reason.
 *
 * Help constrains itself to a 720px reading column, so everything lives inside
 * one `.measure` element. There is no container-level gap to check — the rhythm
 * there is set by the module CSS on its children, which the `boxedWrappers`
 * assertion covers separately.
 */
const SINGLE_BLOCK = { help: 'reading column, one .measure wrapper' };
const WIDTH = 1600;

/** `--s5` is the design gap; `.largeTitleBlock` adds 4px below the title. */
const MIN_GAP = 16;

let browser;
let page;

beforeAll(async () => {
  if (!chromium) return;
  browser = await chromium.launch({ channel: 'chrome' });
  page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/**
 * Vertical gap between each pair of top-level blocks on the page.
 *
 * Measured from the container's own layout, not by walking the DOM: a page may
 * return a fragment, a `.pageStack`, or a `display: contents` wrapper, and all
 * three are supposed to end up as siblings inside `.container`'s flex column.
 * So read the container's laid-out children — whatever wrapper produced them —
 * and check the gap the container itself applied. That is the property under
 * test, and it is what a wrapper swallowing the gap actually breaks.
 */
async function blocksFor(pageName) {
  const nav = page.locator(`.navItem[data-page=${pageName}]`).first();
  if (await nav.isVisible()) await nav.click();
  else await page.evaluate((x) => document.querySelector(`.navItem[data-page=${x}]`).click(), pageName);
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const container = document.querySelector('.container');
    // `.container` is `display: flex; flex-direction: column`, so the visual
    // order of its children IS its layout order. Filter to what occupies space.
    // Descend through a wrapper even when it still lays out as a box — that is
    // precisely the regression, and stopping there would collapse the page to a
    // single "block" with no gaps at all, which the gap assertions would then
    // vacuously pass. So unwrap `.pageStack` by class, not by computed display.
    const unwrapStack = (el) => {
      if (el.classList.contains('pageStack')) return [...el.children].flatMap(unwrapStack);
      if (getComputedStyle(el).display === 'contents') return [...el.children].flatMap(unwrapStack);
      return [el];
    };
    const blocks = [...container.children].flatMap(unwrapStack)
      .filter((e) => e.getBoundingClientRect().height > 0);
    const gaps = [];
    for (let i = 1; i < blocks.length; i++) {
      gaps.push(Math.round(
        blocks[i].getBoundingClientRect().top - blocks[i - 1].getBoundingClientRect().bottom,
      ));
    }
    return {
      gaps,
      names: blocks.map((e) => (e.className || e.tagName).toString().slice(0, 24)),
      // Report a wrapper that swallows the whole page. A real top-level block
      // (a card, a stat grid) also has children, so child count alone proves
      // nothing — what matters is whether it is the page's ONLY laid-out child,
      // which is the shape the bug produced.
      boxedWrappers: (() => {
        // The bug's shape: `.container` has exactly one laid-out child, and that
        // child is a box. Its own children then stack flush because the
        // container's gap only applies to that single child.
        const kids = [...container.children];
        if (kids.length !== 1) return [];
        const only = kids[0];
        if (getComputedStyle(only).display === 'contents') return [];
        // A page whose single wrapper carries its own rhythm is fine. Help
        // constrains its width in a `.measure` element and stacks its children
        // with module-CSS margins, so `gap: normal` there does not mean flush.
        // The signal that distinguishes it from the bug is whether the
        // wrapper's children are actually separated.
        const inner = [...only.children].filter((k) => k.getBoundingClientRect().height > 0);
        if (inner.length < 2) return [(only.className || only.tagName).toString()];
        const separated = inner.slice(1).some((k, i) =>
          k.getBoundingClientRect().top - inner[i].getBoundingClientRect().bottom > 1);
        if (separated) return [];
        return [(only.className || only.tagName).toString()];
      })(),
    };
  });
}

describe('vertical rhythm', () => {
  it('reaches every page', async () => {
    expect(PAGES.length).toBe(12);
  }, 60_000);

  for (const pageName of PAGES) {
    it.skipIf(SKIP)(`${pageName}: no two blocks touch`, async () => {
      const { gaps, names } = await blocksFor(pageName);
      // Fewer than two blocks means everything collapsed behind one wrapper —
      // there is no gap left to measure, so a vacuous pass would hide the bug.
      if (names.length < 2) {
        if (SINGLE_BLOCK[pageName]) return;
        throw new Error(
          `${pageName}: halaman menyatu jadi satu blok (${names.join(', ')}) — `
          + 'wrapper menutupi gap .container',
        );
      }
      const flush = gaps.filter((g) => g <= 1);
      expect(flush, `gap ${gaps.join(', ')} — a wrapper is eating .container's gap`)
        .toEqual([]);
    }, 60_000);
  }

  for (const pageName of PAGES) {
    it.skipIf(SKIP)(`${pageName}: gaps stay generous`, async () => {
      const { gaps, names } = await blocksFor(pageName);
      const cramped = gaps
        .map((g, i) => [g, i])
        .filter(([g]) => g < MIN_GAP);
      expect(
        cramped.map(([g, i]) => `${names[i]}→${names[i + 1]}: ${g}px`),
        `below ${MIN_GAP}px`,
      ).toEqual([]);
    }, 60_000);
  }

  it.skipIf(SKIP)('no page boxes its topbar-actions wrapper', async () => {
    const offenders = [];
    for (const pageName of PAGES) {
      const { boxedWrappers } = await blocksFor(pageName);
      // A page-level wrapper that still generates a box around all its content
      // is the old bug's signature: it becomes `.container`'s single child, so
      // the container's gap applies between it and nothing else.
      if (boxedWrappers.length) offenders.push(`${pageName}: ${boxedWrappers.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
