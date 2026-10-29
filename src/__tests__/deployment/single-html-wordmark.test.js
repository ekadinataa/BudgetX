// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSingleHtml } from '../../../scripts/build-single-html.mjs';

describe('standalone build with bundled reference wordmarks', () => {
  it('accepts imported wordmarks with no legacy runtime /logo.png reference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'budgetx-brand-build-'));
    try {
      await mkdir(join(dir, 'assets'));
      await writeFile(join(dir, 'assets/app.js'), 'const wordmark="data:image/png;base64,eA=="; console.log(wordmark);');
      await writeFile(join(dir, 'assets/app.css'), '.brandLogo { display: block; }');
      await writeFile(join(dir, 'logo.png'), Buffer.from('favicon fixture'));
      await writeFile(join(dir, 'index.html'), '<html><head><link rel="icon" href="/logo.png"><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head></html>');
      const { html, logoRefs } = await buildSingleHtml(dir);
      expect(logoRefs).toBe(0);
      expect(html).toContain('data:image/png;base64,eA==');
      expect(html).not.toContain('/logo.png');
      expect(html).not.toContain('/assets/');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
