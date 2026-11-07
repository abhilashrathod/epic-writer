import { describe, expect, it } from 'vitest';
import { splitTitlePage } from './title-page';

describe('splitTitlePage', () => {
  it('splits keys, multi-line values and the body', () => {
    const text = [
      'Title:',
      '    _**THE LONG ROAD**_',
      '    Part One',
      'Credit: Written by',
      'Author: A. Writer',
      '',
      '',
      'INT. HALL - DAY',
    ].join('\n');
    expect(splitTitlePage(text)).toEqual({
      title: 'THE LONG ROAD Part One',
      fields: {
        title: '_**THE LONG ROAD**_\nPart One',
        credit: 'Written by',
        author: 'A. Writer',
      },
      body: 'INT. HALL - DAY',
    });
  });

  it('leaves text without a title page unchanged', () => {
    for (const text of ['INT. HALL - DAY\n\nMist.', 'CUT TO:\n\nEXT. RIVER', '', '\nTitle: X'])
      expect(splitTitlePage(text)).toEqual({ title: null, fields: {}, body: text });
  });

  it('returns a null title when the page has no Title key', () => {
    expect(splitTitlePage('Author: Someone\n\nEXT. FIELD')).toEqual({
      title: null,
      fields: { author: 'Someone' },
      body: 'EXT. FIELD',
    });
  });

  it('treats a file of only keys as all title page', () => {
    expect(splitTitlePage('Title: Draft')).toEqual({
      title: 'Draft',
      fields: { title: 'Draft' },
      body: '',
    });
  });
});
