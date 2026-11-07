import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { issueUnderlines, setUnderlines, underlineField } from './issue-underlines';

const ranges = (s: EditorState) => {
  const out: [number, number][] = [];
  s.field(underlineField).between(0, s.doc.length, (from, to) => void out.push([from, to]));
  return out;
};

describe('issue underlines', () => {
  const start = EditorState.create({
    doc: 'Bhishma speaks. Karna waits.',
    extensions: issueUnderlines,
  }).update({
    effects: setUnderlines.of([
      { id: 'a', from: 0, to: 7, severity: 'error' },
      { id: 'b', from: 16, to: 21, severity: 'warning' },
      { id: 'c', from: 5, to: 99, severity: 'info' },
    ]),
  }).state;

  it('sets underlines, skipping ranges outside the text', () => {
    expect(ranges(start)).toEqual([
      [0, 7],
      [16, 21],
    ]);
  });

  it('maps underlines through edits elsewhere and drops the ones whose text is edited', () => {
    const before = start.update({ changes: { from: 0, insert: 'Old ' } }).state;
    expect(ranges(before)).toEqual([
      [4, 11],
      [20, 25],
    ]);
    const atEdge = start.update({ changes: { from: 7, insert: '!' } }).state;
    expect(ranges(atEdge)).toEqual([
      [0, 7],
      [17, 22],
    ]);
    const inside = start.update({ changes: { from: 17, to: 18, insert: 'A' } }).state;
    expect(ranges(inside)).toEqual([[0, 7]]);
  });
});
