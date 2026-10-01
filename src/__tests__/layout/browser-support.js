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
