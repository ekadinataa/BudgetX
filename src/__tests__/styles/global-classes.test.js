/**
 * Global-class contract.
 *
 * Two bugs during the CSS-Module -> base.css migration were invisible to lint,
 * to the build, and to the class-count checks:
 *
 *   1. A renamed class in the JSX with nothing defining it. `styles` swapping
 *      and dead-module deletion are separate steps, so a page can briefly name
 *      `allocStatus` while base.css only ever had `allocBar` — and the element
 *      just renders unstyled. Nothing throws.
 *   2. Lifting a module's CSS verbatim over selectors base.css already defined.
 *      That silently overrode 24 existing rules (`.allocBar` most visibly) and
 *      broke the reference's budget-summary row. Neither the build nor any
 *      test noticed.
 *
 * Both are cheap to catch by reading the files, so both are asserted here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(resolve(SRC, ...p), 'utf-8');
const baseCss = read('styles', 'base.css');

/** Every class base.css defines, including inside comma-separated selector lists. */
function definedClasses(css) {
  const out = new Set();
  // Scan the whole stylesheet for `.class` rather than only the last segment of
  // each selector. A descendant rule like `.sectionSpent .sep` does define
  // `sep`, and a version that read only the leading segment reported it as
  // undefined — which is exactly the class a Budget span was using.
  for (const m of css.matchAll(/\.([A-Za-z][\w-]*)/g)) out.add(m[1]);
  return out;
}

const DEFINED = definedClasses(baseCss);

/** Utility classes that are not component styling. */
const ALLOWED_UTILS = new Set([
  // Utility / layout primitives
  'num', 'truncate', 'desktopOnly', 'mobileOnly', 'long', 'auto', 'center',
  'flex', 'grid', 'numeric', 'space-between', 'not-allowed', 'wide',
  // State names that appear as `cond === 'x'` operands inside a className
  // expression and are picked up by the brace walker's quote handling.
  'all', 'cal', 'custom', 'cycle', 'range', 'list', 'month', 'week', 'year',
  'daily', 'weekly', 'monthly', 'yearly', 'active', 'paid', 'done', 'open',
]);

/**
 * Flag a class that two competing top-level rules define differently.
 *
 * Narrow on purpose. A class appearing in several rules is normal and usually
 * correct when the rules differ in scope or timing:
 *
 *   - `.btnSmallGhost { padding }` then `.btnSmallGhost { padding }` under
 *     `@media (max-width: 480px)` — a breakpoint override
 *   - `.navIcon { color }` then `.navItem:hover .navIcon { color }` — a state
 *   - `.calDayHeader, .calGrid { grid }` then `.calDayHeader { margin }` — two
 *     grouped rules each adding a different property
 *
 * The failure that actually shipped was narrower: a module's CSS lifted verbatim
 * on top of base.css, so `.allocBar` got two unrelated bodies at the same
 * cascade position and the second silently won. That is what this looks for —
 * duplicate bare-class rules outside any @media, where the bodies differ.
 */
function conflictingDeclarations(css) {
  // Linear scan, no regex over the body text. The earlier
  // `/[^{}@]+?\s*\{[^{}]*\}/` version needed ~2.9s on this 72KB file — the
  // lazy quantifier backtracks badly — which is most of the 5s test timeout and
  // made the file fail intermittently under full-suite load.
  const bodies = new Map();
  const conflicts = [];
  const comments = /\/\*[\s\S]*?\*\//g;

  let depth = 0;          // brace depth in the original source
  let bufStart = -1;      // where the current rule's selector text began
  const isAtRule = /^@/;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];

    // Comments are not selectors. A comment that quotes a rule by name — e.g.
    // "`.calCell { aspect-ratio: 1/1 }` keeps calendar-sized cells" — was being
    // parsed as that rule, and then reported as a second definition of it.
    if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      i = close === -1 ? css.length : close + 1;
      bufStart = -1;
      continue;
    }

    if (depth === 0 && isAtRule.test(css.slice(i, i + 1)) && /\s/.test(css[i - 1] || ' ')) {
      // Skip an at-rule block: media queries and supports legitimately restate
      // selectors, and keyframes blocks define no classes.
      const nl = css.indexOf('{', i);
      if (nl !== -1) {
        let d = 1;
        let j = nl + 1;
        for (; j < css.length && d > 0; j++) {
          if (css[j] === '{') d++;
          else if (css[j] === '}') d--;
        }
        i = j - 1;
        bufStart = -1;
        continue;
      }
    }

    if (ch === '{') {
      if (depth === 0 && bufStart !== -1) {
        const selector = css.slice(bufStart, i);
        // Only a bare single class counts. `.a .b`, `.a:hover`, `.a[attr]` and
        // comma lists are all deliberate variants, not redefinitions.
        const bare = selector.trim().match(/^\.([A-Za-z][\w-]*)$/);
        if (bare) {
          const name = bare[1];
          // Brace-match the body. `indexOf('}', i)` truncates at the first inner
          // brace, so a rule with a nested block was compared against a prefix
          // and reported as a conflicting redefinition of itself.
          let d = 1;
          let j = i + 1;
          for (; j < css.length && d > 0; j++) {
            if (css[j] === '{') d++;
            else if (css[j] === '}') d--;
          }
          const body = css.slice(i + 1, j - 1)
            .replace(comments, '').replace(/\s+/g, ' ').trim();
          if (body) {
            const prev = bodies.get(name);
            if (prev !== undefined && prev !== body) {
              conflicts.push(`.${name}: [${prev}] -> [${body}]`);
            }
            bodies.set(name, body);
          }
        }
      }
      depth++;
      bufStart = -1;
    } else if (ch === '}') {
      depth--;
      bufStart = -1;
    } else if (depth === 0) {
      // Selector text accumulates from the last structural boundary.
      if (ch === ';' || ch === '\n' || ch === '}') {
        bufStart = -1;
      } else if (bufStart === -1 && /[A-Za-z.#:*[]/.test(ch)) {
        bufStart = i;
      } else if (bufStart !== -1 && !/[A-Za-z0-9#.\s,:>+~[\]="'()_-]/.test(ch)) {
        bufStart = -1;
      }
    }
  }
  return conflicts;
}

function usedClasses(source) {
  const out = new Set();
  const ATTR = /className\s*=\s*/g;
  while (ATTR.exec(source) !== null) {
    let i = ATTR.lastIndex;
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source[i] === '"' || source[i] === "'") {
      const q = source[i];
      const end = source.indexOf(q, i + 1);
      if (end === -1) break;
      for (const c of source.slice(i + 1, end).split(/\s+/)) if (c) out.add(c);
      ATTR.lastIndex = end;
    } else if (source[i] === '{') {
      // Walk to the matching brace, collecting quoted class literals on the way.
      let depth = 0;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) break;
        } else if (ch === "'" || ch === '"' || ch === '`') {
          const q = ch;
          const end = source.indexOf(q, i + 1);
          if (end === -1) break;
          for (const c of source.slice(i + 1, end).split(/\s+/)) {
            if (/^[A-Za-z][\w-]*$/.test(c)) out.add(c);
          }
          i = end;
        }
      }
      ATTR.lastIndex = i + 1;
    } else {
      break;
    }
  }
  return out;
}

function walkJsx(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsx(full));
    else if (entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

describe('global class contract', () => {
  const pages = walkJsx(join(SRC, 'pages')).concat(walkJsx(join(SRC, 'components')));

  it('covers every page and shared component after the migration', () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.some((f) => f.includes('/Investment/'))).toBe(true);
    expect(pages.some((f) => f.includes('/Auth/'))).toBe(true);
    const imports = pages.filter(file => /(?:import|from).*\.module\.css/.test(readFileSync(file, 'utf-8')));
    expect(imports).toEqual([]);
  });

  it('every class a page names is defined in base.css', () => {
    const missing = [];
    for (const file of pages) {
      for (const c of usedClasses(readFileSync(file, 'utf-8'))) {
        if (ALLOWED_UTILS.has(c)) continue;
        if (!DEFINED.has(c)) missing.push(`${file.slice(SRC.length + 1)} -> .${c}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never redefines a property on a selector it already defines', () => {
    expect(conflictingDeclarations(baseCss)).toEqual([]);
  });

  it('keeps base.css balanced', () => {
    const open = (baseCss.match(/{/g) || []).length;
    const close = (baseCss.match(/}/g) || []).length;
    expect(open).toBe(close);
  });

  it('never glues a comment onto a selector', () => {
    // The lift script's selector regex swallowed `/* comment */` lines and
    // emitted `./* comment */`, which the minifier rejects outright.
    const glued = baseCss.split('\n').filter((l) => /^\s*\.[^\n{]*\*\//.test(l));
    expect(glued).toEqual([]);
  });
});
