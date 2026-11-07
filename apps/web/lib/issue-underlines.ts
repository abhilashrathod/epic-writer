import { StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

export interface Underline {
  id: string;
  from: number;
  to: number;
  severity: 'info' | 'warning' | 'error';
}

/** Replaces the underlined continuity issues. */
export const setUnderlines = StateEffect.define<Underline[]>();

// Inclusive, so a mark spanning exactly a mention widget wraps it instead of being dropped.
const mark = (severity: string) =>
  Decoration.mark({ class: `cm-issue cm-issue-${severity}`, inclusive: true });
const marks = { error: mark('error'), warning: mark('warning'), info: mark('info') };

/*
 * Continuity underlines (AI-7). Per keystroke they are only mapped through the change; one whose
 * text is edited is dropped at once, matching the server marking that issue stale on save.
 */
export const underlineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects)
      if (e.is(setUnderlines)) {
        const ranges: Range<Decoration>[] = e.value
          .filter((u) => u.to > u.from && u.to <= tr.state.doc.length)
          .map((u) => marks[u.severity].range(u.from, u.to));
        return Decoration.set(ranges, true);
      }
    if (!tr.docChanged || deco.size === 0) return deco;
    const touched: [number, number][] = [];
    tr.changes.iterChangedRanges((fromA, toA) => touched.push([fromA, toA]));
    // An edit inside or across a flagged range removes it. The rest are re-placed by hand: the
    // marks are inclusive (see above), and plain mapping would stretch them over typing at an edge.
    const kept: Range<Decoration>[] = [];
    for (const it = deco.iter(); it.value; it.next()) {
      const { from, to, value } = it;
      if (touched.some(([a, b]) => a < to && b > from)) continue;
      kept.push(value.range(tr.changes.mapPos(from, 1), tr.changes.mapPos(to, -1)));
    }
    return Decoration.set(kept);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const underline = (color: string) => ({
  textDecoration: `underline wavy ${color}`,
  textDecorationSkipInk: 'none',
  textUnderlineOffset: '3px',
});

export const issueUnderlines = [
  underlineField,
  EditorView.baseTheme({
    '.cm-issue-error, .cm-issue-error .cm-mention': underline('var(--bad)'),
    '.cm-issue-warning, .cm-issue-warning .cm-mention': underline('var(--warn)'),
    '.cm-issue-info, .cm-issue-info .cm-mention': underline('var(--faint)'),
  }),
];
