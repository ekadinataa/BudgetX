import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(globalThis.process?.env?.BUDGETX_PLAYWRIGHT_PATH || 'playwright'));
} catch {
  // Browser checks are optional when Playwright is not installed. The unit
  // suite remains runnable without a live dev server or machine-local paths.
}

export { chromium };

/** Navigate through actual visible controls, not the removed sidebar model. */
export async function navigate(page, id) {
  if (page.viewportSize().width <= 900) {
    await page.locator('.mobileNavMenu > summary').click();
    await page.locator(`.mobileNavPanel [data-page="${id}"]`).click();
  } else {
    const direct = page.locator(`.topnav > [data-page="${id}"]`);
    if (await direct.count()) await direct.click();
    else if (id === 'settings' || id === 'help') await page.locator(`.railButton[aria-label="${id === 'settings' ? 'Pengaturan' : 'Bantuan'}"]`).click();
    else {
      const group = page.locator('.navDetails').filter({ has: page.locator(`[data-page="${id}"]`) });
      await group.locator('summary').click();
      await group.locator(`[data-page="${id}"]`).click();
    }
  }
}

/** Safety guard even if a developer accidentally starts Vite with cloud env. */
export async function localOnly(page) {
  await page.route(/https?:\/\/[^/]*(googleapis\.com|firebaseio\.com|firebaseapp\.com)/, route => route.abort());
  await page.route('**/src/config/firebase.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const auth=null; export const db=null;' }));
}
