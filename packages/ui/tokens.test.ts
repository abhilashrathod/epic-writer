import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const root = join(here, '../..');
const css = readFileSync(join(here, 'tokens.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {\n  --bg`);
  expect(start, `block ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}', start));
}

const colorTokens = (b: string) =>
  [...b.matchAll(/^\s*(--[\w-]+): light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\);/gm)].map((m) => m[1]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.next', 'dist'].includes(e.name)) return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}

describe('tokens.css', () => {
  it('gives both skins the same colour tokens, each with a light and dark value', () => {
    const ink = colorTokens(block(':root'));
    const sand = colorTokens(block(":root[data-skin='sand']"));
    expect(ink).toEqual(
      expect.arrayContaining(['--bg', '--surface', '--primary', '--on-primary', '--warn-soft']),
    );
    expect(ink).toHaveLength(16);
    expect(sand).toEqual(ink);
  });

  it('is the only file with hex colours', () => {
    const offenders = [...sourceFiles(join(root, 'apps')), ...sourceFiles(join(root, 'packages'))]
      .filter((f) => !f.endsWith('tokens.css'))
      .filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});

// Comments are stripped first, so prose like "no border" or "focus ring" doesn't count.
const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('components', () => {
  it('draw no borders (focus ring only)', () => {
    const offenders = sourceFiles(here)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /(^|[\s'"`])(border|ring|divide)(-[\w-]+)?(?=[\s'"`])/m.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
