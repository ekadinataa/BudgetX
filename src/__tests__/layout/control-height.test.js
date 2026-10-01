/**
 * Control-height contract.
 *
 * Controls in this app arrive at three intrinsic heights by design:
 * `.btnSmall*` is 32px, `.seg button` is 28px, and `.inputField` is
 * `var(--tap)` (44px). All three come straight from the reference, and on their
 * own they are correct. The failure is *mixing* them in one row — the Budget
 * topbar put a 32px ghost button, a 44px select and another 32px ghost button
 * side by side, and the Transactions filter card ran 44 / 32 / 28 / 44.
 *
 * Nothing about that is invalid CSS, so nothing failed: it rendered, it passed
 * lint, it passed the responsive sweep (no overflow, nothing clipped), and it
 * still read as "not proportional". Only comparing heights side by side finds
 * it, which is what this file does.
 *
 * The fix is `.toolbar`: an opt-in row that normalises the small controls up to
 * `--tap`, matching `.inputField`. Segmented buttons land 4px short because the
 * `.seg` group adds 2px of padding on each side, so the group box lines up even
 * though the button inside it does not — that is measured as `boxH` below.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from './browser-support';

const URL = globalThis.process?.env?.UAT_URL || 'http://localhost:5173';
const PAGES = [
  'dashboard', 'wallet', 'tx', 'budget', 'recurring', 'subscription',
  'debt', 'invest', 'asset', 'report', 'settings', 'help',
];
const TOLERANCE = 4; // the `.seg` group's 2px padding on each side

let browser;
let page;

beforeAll(async () => {
  if (!chromium) return;
  browser = await chromium.launch({ channel: 'chrome' });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
}, 60_000);

afterAll(async () => { await browser?.close(); });

/** Every interactive control in `scope`, with the box the eye actually sees. */
async function controlsIn(scope) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    return [...root.querySelectorAll('button, select, input:not([type=checkbox]):not([type=radio])')]
      .filter((e) => e.getBoundingClientRect().height > 4)
      .map((e) => {
        // A `.seg` is perceived as one control, not as its buttons.
        const group = e.closest('.seg');
        const box = (group || e).getBoundingClientRect();
        return {
          tag: e.tagName.toLowerCase(),
          cls: (e.className || '').toString().split(/\s+/)[0],
          text: (e.textContent || e.value || e.placeholder || '').trim().slice(0, 16),
          boxH: Math.round(box.height),
          selfH: Math.round(e.getBoundingClientRect().height),
        };
      });
  }, scope);
}

const byBoxHeight = (rows) => {
  const groups = new Map();
  for (const r of rows) {
    const key = Math.round(r.boxH / 4) * 4; // bucket to absorb sub-pixel
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return groups;
};

async function openBudgetModal() {
  await page.locator('.navItem[data-page=budget]').first().click();
  await page.waitForTimeout(350);
  const select = page.locator('.topbarActions select');
  if (await select.count()) {
    const options = await select.locator('option').allTextContents();
    const target = options.find((o) => o.includes('April')) || options[0];
    if (target) await select.selectOption({ label: target });
    await page.waitForTimeout(350);
  }
  const edit = page.locator('.sectionHeader button').first();
  if (await edit.isVisible()) await edit.click();
  await page.waitForTimeout(400);
}

describe.skipIf(!chromium)('control height consistency', () => {
  it('budget topbar is one height', async () => {
    const rows = await (async () => {
      await page.locator('.navItem[data-page=budget]').first().click();
      await page.waitForTimeout(400);
      return controlsIn('.topbarActions');
    })();
    expect(rows.length).toBeGreaterThan(2);
    const heights = [...new Set(rows.map((r) => r.boxH))];
    expect(heights, `topbar heights: ${rows.map((r) => `${r.text || r.cls}=${r.boxH}`).join(', ')}`)
      .toHaveLength(1);
  }, 60_000);

  it('transactions filter card is one height', async () => {
    await page.locator('.navItem[data-page=tx]').first().click();
    await page.waitForTimeout(400);
    const rows = await controlsIn('.filterCard');
    expect(rows.length).toBeGreaterThan(3);
    // The `.seg` group is 4px taller than its buttons by design; compare the
    // group's box, and allow that one difference.
    const heights = [...byBoxHeight(rows).keys()].sort((a, b) => a - b);
    const spread = heights[heights.length - 1] - heights[0];
    expect(spread, `filter card heights: ${rows.map((r) => `${r.text || r.cls}=${r.boxH}`).join(', ')}`)
      .toBeLessThanOrEqual(TOLERANCE);
  }, 60_000);

  it('section edit modal footer is one height', async () => {
    await openBudgetModal();
    const rows = await controlsIn('.modalActions');
    expect(rows.length).toBeGreaterThan(0);
    const heights = [...new Set(rows.map((r) => r.selfH))];
    expect(heights, `footer heights: ${rows.map((r) => `${r.text}=${r.selfH}`).join(', ')}`)
      .toHaveLength(1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }, 60_000);

  it('section edit modal allocation rows are level', async () => {
    await openBudgetModal();
    // Each allocation row is: dot, name, amount field, two icon buttons. The
    // field and the buttons are compared because they share a baseline.
    const result = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role=dialog] .allocationRow')]
        .filter((r) => r.querySelector('.allocInput'));
      if (!rows.length) return null;
      const mismatches = [];
      for (const r of rows) {
        const input = r.querySelector('.allocInput').getBoundingClientRect();
        const icons = [...r.querySelectorAll('.iconBtn')].map((b) => b.getBoundingClientRect());
        for (const ic of icons) {
          if (Math.abs(ic.height - input.height) > 1 || Math.abs(ic.top - input.top) > 1) {
            mismatches.push(`input ${Math.round(input.height)}@${Math.round(input.top)} vs icon ${Math.round(ic.height)}@${Math.round(ic.top)}`);
          }
        }
      }
      return { rows: rows.length, mismatches };
    });
    expect(result, 'the populated fixture must render allocation rows').not.toBeNull();
    expect(result.rows).toBeGreaterThan(0);
    expect(result.mismatches.join('; ')).toBe('');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }, 60_000);

  it('every topbar action row is one height', async () => {
    // The launcher bug and the height bug had the same root: `App.jsx` passed
    // `onAddTx` unconditionally, so the circular `+` appeared on every page,
    // and on Transactions it sat beside a `Tambah` button doing the same thing.
    // A page that publishes its own primary action must not also get one.
    const offenders = [];
    for (const pageName of PAGES) {
      const nav = page.locator(`.navItem[data-page=${pageName}]`).first();
      if (await nav.count() && await nav.isVisible()) await nav.click();
      else if (await nav.count()) {
        await page.evaluate((x) => document.querySelector(`.navItem[data-page=${x}]`).click(), pageName);
      } else {
        continue; // fire is reached from Settings
      }
      await page.waitForTimeout(300);
      const rows = await controlsIn('.topbarActions');
      if (rows.length > 1) {
        const heights = [...new Set(rows.map((r) => r.boxH))];
        if (heights.length > 1) {
          offenders.push(`${pageName}: ${rows.map((r) => `${r.text || r.cls}=${r.boxH}`).join(', ')}`);
        }
      }
      // Two ways to add a transaction in one toolbar is redundant.
      const addCount = rows.filter((r) => /tambah|add/i.test(r.text)).length;
      if (addCount > 1) offenders.push(`${pageName}: ${addCount} tombol tambah`);
    }
    expect(offenders).toEqual([]);
  }, 120_000);

  it('no add-transaction launcher on pages that declare their own action', async () => {
    // `tx` and `budget` both publish a primary action through `usePageActions`,
    // so the topbar's circular `+` must not render on them.
    for (const pageName of ['tx', 'budget']) {
      const nav = page.locator(`.navItem[data-page=${pageName}]`).first();
      if (await nav.isVisible()) await nav.click();
      else await page.evaluate((x) => document.querySelector(`.navItem[data-page=${x}]`).click(), pageName);
      await page.waitForTimeout(300);
      const launcher = await page.locator(
        '.topbarActions button[aria-label="Tambah Transaksi"]',
      ).count();
      expect(launcher, `${pageName} punya tombol + yang dobel`).toBe(0);
    }
  }, 60_000);

  it('modal close button is square and usable at desktop density', async () => {
    await openBudgetModal();
    const close = await page.evaluate(() => {
      const b = document.querySelector('[role=dialog] button[aria-label="Tutup"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { height: r.height, width: r.width };
    });
    expect(close).not.toBeNull();
    expect(close.height).toBeGreaterThanOrEqual(28);
    expect(close.height).toBeLessThanOrEqual(40);
    expect(close.width).toBeCloseTo(close.height, 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }, 60_000);

  it('mobile controls keep touch targets without squeezing the period selector', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const id of ['wallet', 'tx', 'budget']) {
      await page.evaluate(id => document.querySelector(`.navItem[data-page="${id}"]`).click(), id);
      await page.waitForTimeout(100);
      const sizes = await page.evaluate(() => [...document.querySelectorAll('.topbarActions button, .topbarActions select')]
        .map(e => {
          const r = e.getBoundingClientRect();
          return { tag: e.tagName, width: r.width, height: r.height, left: r.left, right: r.right };
        }).filter(r => r.width > 0));
      expect(sizes.length).toBeGreaterThan(0);
      for (const r of sizes) {
        expect(r.height).toBeGreaterThanOrEqual(44);
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(360);
        if (r.tag === 'SELECT') expect(r.width).toBeGreaterThan(110);
      }
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
  }, 60_000);

  it('appearance presets actually change computed density and radius', async () => {
    await page.locator('.navItem[data-page=settings]').click();
    await page.getByRole('button', { name: 'Padat', exact: true }).click();
    await page.getByRole('button', { name: 'Tajam', exact: true }).click();
    const compact = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return { density: root.getPropertyValue('--density-scale').trim(), radius: root.getPropertyValue('--radius-scale').trim(), cardRadius: parseFloat(getComputedStyle(document.querySelector('.card')).borderRadius) };
    });
    expect(compact.density).toBe('0.84');
    expect(compact.radius).toBe('0.55');
    await page.getByRole('button', { name: 'Longgar', exact: true }).click();
    await page.getByRole('button', { name: 'Bulat', exact: true }).click();
    const relaxed = await page.evaluate(() => ({ density: getComputedStyle(document.documentElement).getPropertyValue('--density-scale').trim(), radius: parseFloat(getComputedStyle(document.querySelector('.card')).borderRadius) }));
    expect(relaxed.density).toBe('1.16');
    expect(relaxed.radius).toBeGreaterThan(compact.cardRadius);
    await page.getByRole('button', { name: 'Standar', exact: true }).click();
    await page.getByRole('button', { name: 'Lembut', exact: true }).click();
  }, 60_000);
});
