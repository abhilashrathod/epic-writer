import { EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { classifyLines } from './classify';
import {
  cycleElement,
  fountainEnter,
  fountainLineTypes,
  lineTypeAt,
  reclassify,
} from './codemirror';
import { generateScript } from './script-fixture';

/** Runs a command with the cursor at `|`; returns the new text with `|` at the cursor, or null if it declined. */
function run(cmd: StateCommand, textWithCursor: string): string | null {
  const at = textWithCursor.indexOf('|');
  let state = EditorState.create({
    doc: textWithCursor.replace('|', ''),
    selection: { anchor: at },
  });
  const ok = cmd({ state, dispatch: (tr) => (state = tr.state) });
  if (!ok) return null;
  const head = state.selection.main.head;
  const doc = state.doc.toString();
  return doc.slice(0, head) + '|' + doc.slice(head);
}

describe('lineTypeAt', () => {
  it('uses context above the line', () => {
    const doc = EditorState.create({ doc: 'Action.\n\nBHISHMA\n(softly)\nI vow.\n\nAfter.' }).doc;
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => lineTypeAt(doc, n))).toEqual([
      'action',
      'blank',
      'character',
      'parenthetical',
      'dialogue',
      'blank',
      'action',
    ]);
  });
});

describe('fountainEnter', () => {
  it('adds a blank line after a scene heading or transition', () => {
    expect(run(fountainEnter, 'INT. HALL - DAY|')).toBe('INT. HALL - DAY\n\n|');
    expect(run(fountainEnter, 'x\n\nCUT TO:|')).toBe('x\n\nCUT TO:\n\n|');
  });

  it('goes straight to dialogue after a cue, even mid-script', () => {
    expect(run(fountainEnter, 'x\n\nBHISHMA|')).toBe('x\n\nBHISHMA\n|');
    expect(run(fountainEnter, 'x\n\nBHISHMA|\n\nINT. HALL')).toBe('x\n\nBHISHMA\n|\n\nINT. HALL');
  });

  it('falls through for action, dialogue, mid-line and empty lines', () => {
    expect(run(fountainEnter, 'He waits.|')).toBeNull();
    expect(run(fountainEnter, '\nBHISHMA\nI vow.|')).toBeNull();
    expect(run(fountainEnter, 'INT. HA|LL')).toBeNull();
    expect(run(fountainEnter, 'x\n|')).toBeNull();
  });
});

describe('cycleElement', () => {
  it('cycles action → character → scene heading → transition → action', () => {
    let text = '\nArjuna|';
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      text = run(cycleElement, text)!;
      seen.push(text);
    }
    expect(seen).toEqual(['\n@Arjuna|', '\n.Arjuna|', '\n>Arjuna|', '\nArjuna|']);
  });

  it('skips the prefix when the text already reads as the target type', () => {
    expect(run(cycleElement, '\nWaits.\n\nARJUNA|\nGo.')).toBe('\nWaits.\n\n.ARJUNA|\nGo.');
    expect(run(cycleElement, 'x\n\n@ARJUNA|\nGo.')).toBe('x\n\n.ARJUNA|\nGo.');
  });

  it('opens a parenthetical on an empty dialogue line', () => {
    expect(run(cycleElement, '\nBHISHMA\n|')).toBe('\nBHISHMA\n(|)');
  });

  it('declines with a selection or on types outside the cycle', () => {
    expect(run(cycleElement, '# Act One|')).toBeNull();
  });
});

describe('fountainLineTypes (incremental)', () => {
  // Deterministic pseudo-random edits, each checked against a full re-classification.
  function rng(seed: number) {
    return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  }
  const SNIPPETS = ['\n', '\n\n', 'BHISHMA', 'INT. HALL', '(softly)', 'x', 'CUT TO:', '', '@', '!'];

  it('always matches classifying the whole document', () => {
    const rand = rng(7);
    let state = EditorState.create({ doc: generateScript(10), extensions: fountainLineTypes });
    for (let i = 0; i < 2000; i++) {
      const len = state.doc.length;
      const from = Math.floor(rand() * len);
      const to = Math.min(len, from + (rand() < 0.4 ? Math.floor(rand() * 40) : 0));
      const insert = SNIPPETS[Math.floor(rand() * SNIPPETS.length)]!;
      state = state.update({ changes: { from, to, insert } }).state;
      expect(state.field(fountainLineTypes), `edit ${i}`).toEqual(
        classifyLines(state.doc.toJSON()),
      );
    }
  });

  it('handles several changes in one transaction', () => {
    let state = EditorState.create({
      doc: 'A\n\nBHISHMA\nI vow.\n\nEnd.',
      extensions: fountainLineTypes,
    });
    state = state.update({
      changes: [
        { from: 0, insert: 'INT. ' },
        { from: 3, to: 3, insert: 'x\n' },
      ],
    }).state;
    expect(state.field(fountainLineTypes)).toEqual(classifyLines(state.doc.toJSON()));
  });

  it('leaves lines far from a local edit untouched', () => {
    const state = EditorState.create({ doc: generateScript(), extensions: fountainLineTypes });
    const old = state.field(fountainLineTypes);
    const tr = state.update({ changes: { from: state.doc.line(1500).to, insert: 'x' } });
    const next = reclassify(old, state.doc, tr.state.doc, tr.changes);
    expect(next.filter((t, i) => t !== old[i]).length).toBeLessThanOrEqual(2);
  });
});

describe('benchmark: 60-page script', () => {
  it('updates line types well under 16 ms per keystroke', () => {
    const doc = generateScript();
    let state = EditorState.create({ doc, extensions: fountainLineTypes });
    expect(state.doc.lines).toBeGreaterThan(2900);

    const time = (posOf: (s: EditorState) => number) => {
      const samples: number[] = [];
      for (let i = 0; i < 300; i++) {
        const t0 = performance.now();
        state = state.update({ changes: { from: posOf(state), insert: 'a' } }).state;
        state.field(fountainLineTypes);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return { median: samples[150]!, p99: samples[297]!, max: samples[299]! };
    };
    const end = time((s) => s.doc.length);
    const middle = time((s) => s.doc.line(Math.floor(s.doc.lines / 2)).to);
    const fmt = (r: { median: number; p99: number; max: number }) =>
      `median ${r.median.toFixed(3)} ms, p99 ${r.p99.toFixed(3)} ms, max ${r.max.toFixed(3)} ms`;
    process.stdout.write(
      `\n[bench] ${state.doc.lines} lines\n[bench] end:    ${fmt(end)}\n[bench] middle: ${fmt(middle)}\n`,
    );
    expect(end.p99).toBeLessThan(16);
    expect(middle.p99).toBeLessThan(16);
  });
});
