import { describe, expect, it } from 'vitest';
import { Invalid } from '@epic/core';
import { importFileInput } from '@epic/schemas/import';
import { tinyDocx, tinyPdf } from '../e2e/fixture-files';
import { parseNote } from './parse-note';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('parseNote', () => {
  it('passes Markdown and text through, without a byte-order mark', async () => {
    expect(await parseNote('a.md', bytes('\uFEFF# Title\n\nBody'))).toBe('# Title\n\nBody');
    expect(await parseNote('a.txt', bytes('Plain'))).toBe('Plain');
  });

  it('reads Word paragraphs', async () => {
    const text = await parseNote('a.docx', tinyDocx(['The river town.', 'The old mill.']));
    expect(text.trim()).toBe('The river town.\n\nThe old mill.');
  });

  it('reads PDF text', async () => {
    const text = await parseNote('a.pdf', tinyPdf(['The river town.', 'The old mill.']));
    expect(text).toContain('The river town.');
    expect(text).toContain('The old mill.');
  });

  it('explains unreadable and empty files', async () => {
    await expect(parseNote('a.docx', bytes('not a zip'))).rejects.toBeInstanceOf(Invalid);
    await expect(parseNote('a.pdf', bytes('not a pdf'))).rejects.toThrow(/Couldn't read/);
    await expect(parseNote('a.txt', bytes('  \n'))).rejects.toThrow(/no text/);
  });
});

describe('importFileInput', () => {
  it('accepts note formats up to 10 MB and refuses others', () => {
    expect(importFileInput.safeParse(new File(['x'], 'a.markdown')).success).toBe(true);
    expect(importFileInput.safeParse(new File(['x'], 'a.exe')).error?.issues[0]?.message).toMatch(
      /Import Markdown/,
    );
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.txt');
    expect(importFileInput.safeParse(big).error?.issues[0]?.message).toMatch(/10 MB/);
    expect(importFileInput.safeParse('text').success).toBe(false);
  });
});
