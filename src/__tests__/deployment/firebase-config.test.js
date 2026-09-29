import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve project root (budgetku/) from this test file location
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..', '..');

function readConfig(filename) {
  return readFileSync(resolve(projectRoot, filename), 'utf-8');
}

function readJsonConfig(filename) {
  return JSON.parse(readConfig(filename));
}

// ── .firebaserc ─────────────────────────────────────────────────────────────
// Validates: Requirements 1.2

describe('.firebaserc', () => {
  it('has projects.default set to budgetku-app-v1', () => {
    const rc = readJsonConfig('.firebaserc');
    expect(rc.projects.default).toBe('budgetku-app-v1');
  });
});

// ── firebase.json ───────────────────────────────────────────────────────────
// Validates: Requirements 3.3, 3.4, 3.5, 7.1, 7.3

describe('firebase.json', () => {
  const config = readJsonConfig('firebase.json');

  // `hosting` is an array: the primary site ("budgetx" target) plus a legacy site
  // ("budgetku-app-v1" site) that only 301-redirects to the primary.
  const primary = config.hosting.find((h) => h.target === 'budgetx');
  const legacy = config.hosting.find((h) => h.site === 'budgetku-app-v1');

  it('declares hosting as an array of site configs', () => {
    expect(Array.isArray(config.hosting)).toBe(true);
    expect(primary).toBeDefined();
    expect(legacy).toBeDefined();
  });

  it('has hosting.public set to "dist" on the primary site', () => {
    expect(primary.public).toBe('dist');
  });

  it('does NOT have a functions key (Spark plan compliance)', () => {
    expect(config).not.toHaveProperty('functions');
  });

  it('has the SPA rewrite rule (** → /index.html) on the primary site', () => {
    expect(primary.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '**', destination: '/index.html' }),
      ]),
    );
  });

  it('has immutable cache headers for /assets/** on the primary site', () => {
    const headers = primary.headers;
    const assetsRule = headers.find((h) => h.source === '/assets/**');
    expect(assetsRule).toBeDefined();

    const cacheHeader = assetsRule.headers.find(
      (h) => h.key === 'Cache-Control',
    );
    expect(cacheHeader).toBeDefined();
    expect(cacheHeader.value).toContain('immutable');
    expect(cacheHeader.value).toContain('max-age=31536000');
  });

  it('redirects the legacy site to the primary URL with 301', () => {
    expect(legacy.redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '**',
          destination: 'https://budgetx.web.app',
          type: 301,
        }),
      ]),
    );
  });
});

// ── firestore.rules ─────────────────────────────────────────────────────────
// Validates: Requirements 4.2, 4.3

describe('firestore.rules', () => {
  const rules = readConfig('firestore.rules');

  it('contains the global deny rule', () => {
    expect(rules).toContain('allow read, write: if false');
  });

  it('contains the per-user isolation rule', () => {
    expect(rules).toContain('match /users/{userId}/{document=**}');
    expect(rules).toContain('request.auth.uid == userId');
  });
});
