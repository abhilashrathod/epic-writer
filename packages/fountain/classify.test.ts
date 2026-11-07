import { describe, expect, it } from 'vitest';
import { classifyLine, classifyLines, looksLikeCue, type LineType } from './classify';

const types = (text: string) => classifyLines(text.split('\n'));

describe('classifyLines', () => {
  it('reads a standard scene', () => {
    const script = [
      'INT. HASTINAPURA PALACE - NIGHT',
      '',
      'Lamps gutter in the wind.',
      '',
      'BHISHMA',
      '(quietly)',
      'The river remembers.',
      'Everything.',
      '',
      'CUT TO:',
      '',
      'EXT. GANGA BANKS - DAWN',
    ].join('\n');
    expect(types(script)).toEqual<LineType[]>([
      'sceneHeading',
      'blank',
      'action',
      'blank',
      'character',
      'parenthetical',
      'dialogue',
      'dialogue',
      'blank',
      'transition',
      'blank',
      'sceneHeading',
    ]);
  });

  it.each([
    'INT. HALL',
    'EXT. FIELD',
    'INT./EXT. CHARIOT',
    'I/E. GATE',
    'int. hall',
    'EST. CITY',
    'INT/EXT CAR',
  ])('detects scene heading %s', (h) => expect(classifyLine(h, null, '')).toBe('sceneHeading'));

  it('does not treat words starting with INT/EXT as headings', () => {
    expect(classifyLine('INTERIOR design matters.', null, '')).toBe('action');
    expect(classifyLine('EXTRA lamps', 'blank', '')).toBe('action');
  });

  it('needs a blank line before cues, headings and transitions', () => {
    expect(types('He waits.\nARJUNA\nNow.')).toEqual(['action', 'action', 'action']);
    expect(types('He waits.\nINT. HALL')).toEqual(['action', 'action']);
  });

  it('treats a caps line followed by a blank line as action, but allows it at the end while typing', () => {
    expect(types('\nBOOM.\n\nSmoke.')).toEqual(['blank', 'action', 'blank', 'action']);
    expect(types('Text.\n\nARJUNA')).toEqual(['action', 'blank', 'character']);
  });

  it('accepts cue extensions and dual dialogue, and rejects caseless scripts', () => {
    expect(classifyLine('KARNA (V.O.)', 'blank', 'Line.')).toBe('character');
    expect(classifyLine("DRONA (cont'd)", 'blank', 'Line.')).toBe('character');
    expect(classifyLine('ARJUNA ^', 'blank', 'Line.')).toBe('character');
    expect(classifyLine('अर्जुन', 'blank', 'Line.')).toBe('action');
    expect(classifyLine('42', 'blank', 'Line.')).toBe('action');
  });

  it('honours forced elements', () => {
    const cases: [string, LineType][] = [
      ['!INT. NOT A HEADING', 'action'],
      ['.FLASHBACK', 'sceneHeading'],
      ['@McCLANE', 'character'],
      ['> FADE OUT.', 'transition'],
      ['> THE END <', 'centered'],
      ['~ a sung line', 'lyrics'],
      ['# Act One', 'section'],
      ['= Bhishma takes the vow.', 'synopsis'],
      ['===', 'pageBreak'],
      ['[[a note to self]]', 'note'],
    ];
    for (const [line, type] of cases) expect(classifyLine(line, null, 'x'), line).toBe(type);
  });

  it('does not force a heading from an ellipsis', () => {
    expect(classifyLine('...and silence.', null, '')).toBe('action');
  });

  it('ignores markers when classifying', () => {
    expect(
      classifyLine('INT. HALL - DAY [[@s:0190a3b4-0000-7000-8000-000000000001]]', null, ''),
    ).toBe('sceneHeading');
    expect(classifyLine('[[@e:k1|BHISHMA]]', 'blank', 'I vow it.')).toBe('character');
    expect(classifyLine('[[@s:k1]]', null, '')).toBe('note');
  });

  it('transitions need caps and TO:', () => {
    expect(classifyLine('SMASH CUT TO:', 'blank', '')).toBe('transition');
    expect(classifyLine('He walks to:', 'blank', '')).toBe('action');
  });
});

describe('looksLikeCue', () => {
  it('ignores what follows, for use while typing', () => {
    expect(looksLikeCue('ARJUNA', 'blank')).toBe(true);
    expect(looksLikeCue('ARJUNA', null)).toBe(true);
    expect(looksLikeCue('ARJUNA', 'action')).toBe(false);
    expect(looksLikeCue('@Arjuna', 'action')).toBe(true);
    expect(looksLikeCue('INT. HALL', 'blank')).toBe(false);
    expect(looksLikeCue('CUT TO:', 'blank')).toBe(false);
    expect(looksLikeCue('Arjuna', 'blank')).toBe(false);
  });
});
