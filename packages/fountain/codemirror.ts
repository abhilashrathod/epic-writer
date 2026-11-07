import {
  Prec,
  RangeSetBuilder,
  StateField,
  type ChangeSet,
  type EditorState,
  type Extension,
  type StateCommand,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { classifyLine, classifyLines, looksLikeCue, type LineType } from './classify';
import { findMarkers } from './markers';

/** Line type at a 1-based line, classified from the nearest blank line above (at most 200 lines back). */
export function lineTypeAt(doc: Text, lineNo: number): LineType {
  let start = lineNo;
  while (start > 1 && lineNo - start < 200 && doc.line(start - 1).text.trim() !== '') start--;
  let prev: LineType | null = start === 1 ? null : 'blank';
  for (let n = start; n <= lineNo; n++) {
    const next = n < doc.lines ? doc.line(n + 1).text : null;
    prev = classifyLine(doc.line(n).text, prev, next);
  }
  return prev ?? 'blank';
}

/**
 * Re-classifies after an edit, reusing `old` everywhere it can. Recomputes the edited lines plus
 * one above (its type depends on the next line) and continues downward only while types differ
 * from before (a type change ripples into the dialogue below). Exported for tests.
 */
export function reclassify(
  old: readonly LineType[],
  oldDoc: Text,
  doc: Text,
  changes: ChangeSet,
): LineType[] {
  let fromA = Infinity;
  let toA = -1;
  let fromB = Infinity;
  let toB = -1;
  changes.iterChangedRanges((fa, ta, fb, tb) => {
    fromA = Math.min(fromA, fa);
    toA = Math.max(toA, ta);
    fromB = Math.min(fromB, fb);
    toB = Math.max(toB, tb);
  });
  if (toA < 0) return [...old];
  const oldFirst = oldDoc.lineAt(fromA).number;
  const oldLast = oldDoc.lineAt(toA).number;
  const first = doc.lineAt(fromB).number;
  const last = doc.lineAt(toB).number;
  const types: LineType[] = [
    ...old.slice(0, oldFirst - 1),
    ...Array<LineType>(last - first + 1).fill('blank'),
    ...old.slice(oldLast),
  ];
  const start = Math.max(1, first - 1);
  let prev: LineType | null = start > 1 ? (types[start - 2] ?? null) : null;
  for (let n = start; n <= doc.lines; n++) {
    const t = classifyLine(doc.line(n).text, prev, n < doc.lines ? doc.line(n + 1).text : null);
    if (n > last + 1 && t === types[n - 1]) break;
    types[n - 1] = t;
    prev = t;
  }
  return types;
}

/** Every line's type (index = line number - 1), kept up to date incrementally. */
export const fountainLineTypes = StateField.define<readonly LineType[]>({
  create: (state) => classifyLines(state.doc.toJSON()),
  update: (types, tr) =>
    tr.docChanged ? reclassify(types, tr.startState.doc, tr.state.doc, tr.changes) : types,
});

/** Line type from the state field when present, else from a local lookback. */
function typeAt(state: EditorState, lineNo: number): LineType {
  const field = state.field(fountainLineTypes, false);
  return field ? (field[lineNo - 1] ?? 'blank') : lineTypeAt(state.doc, lineNo);
}

function prevTypeAt(state: EditorState, lineNo: number): LineType | null {
  return lineNo === 1 ? null : typeAt(state, lineNo - 1);
}

/**
 * Enter at the end of a line: a scene heading or transition gets a blank line after it; a cue
 * moves straight to dialogue. Elsewhere it falls through to the default newline.
 */
export const fountainEnter: StateCommand = ({ state, dispatch }) => {
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to || line.text.trim() === '') return false;
  const type = typeAt(state, line.number);
  let insert: string | null = null;
  if (type === 'sceneHeading' || type === 'transition') insert = '\n\n';
  else if (type === 'character' || looksLikeCue(line.text, prevTypeAt(state, line.number)))
    insert = '\n';
  if (insert === null) return false;
  dispatch(
    state.update({
      changes: { from: sel.head, insert },
      selection: { anchor: sel.head + insert.length },
      scrollIntoView: true,
      userEvent: 'input',
    }),
  );
  return true;
};

const CYCLE: LineType[] = ['action', 'character', 'sceneHeading', 'transition'];
const FORCE: Partial<Record<LineType, string>> = {
  action: '!',
  character: '@',
  sceneHeading: '.',
  transition: '>',
};

/**
 * Tab: on an empty dialogue line, opens a parenthetical. Otherwise cycles the line through
 * action → character → scene heading → transition, using Fountain's force prefixes only when the
 * text wouldn't already read as the target type.
 */
export const cycleElement: StateCommand = ({ state, dispatch }) => {
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const prev = prevTypeAt(state, line.number);
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : null;

  // Right after Enter on a cue the dialogue line is still empty, so the cue is judged loosely.
  const prevText = line.number > 1 ? state.doc.line(line.number - 1).text : '';
  const afterCue = line.number > 1 && looksLikeCue(prevText, prevTypeAt(state, line.number - 1));
  if (line.text.trim() === '' && (afterCue || prev === 'dialogue' || prev === 'parenthetical')) {
    dispatch(
      state.update({
        changes: { from: line.from, to: line.to, insert: '()' },
        selection: { anchor: line.from + 1 },
        userEvent: 'input',
      }),
    );
    return true;
  }

  const current = classifyLine(line.text, prev, next);
  const i = CYCLE.indexOf(current);
  if (i < 0) return false;
  const target = CYCLE[(i + 1) % CYCLE.length]!;
  const bare = line.text.replace(/^\s*[!@.>](?!\.)/, '');
  const prefix = classifyLine(bare, prev, next) === target ? '' : (FORCE[target] ?? '');
  const insert = prefix + bare;
  const cursor = Math.max(line.from, sel.head - (line.text.length - insert.length));
  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: Math.min(cursor, line.from + insert.length) },
      userEvent: 'input',
    }),
  );
  return true;
};

/** Adds a `cm-fountain-<type>` class to each visible non-blank line, for screenplay layout in CSS. */
export const fountainLineClasses = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineClasses(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildLineClasses(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

function buildLineClasses(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const types = view.state.field(fountainLineTypes);
  let lastLine = 0;
  for (const { from, to } of view.visibleRanges) {
    for (let n = Math.max(doc.lineAt(from).number, lastLine + 1); n <= doc.lineAt(to).number; n++) {
      const type = types[n - 1];
      if (type && type !== 'blank') {
        const { from: at } = doc.line(n);
        b.add(at, at, Decoration.line({ class: `cm-fountain-${type}` }));
      }
      lastLine = n;
    }
  }
  return b.finish();
}

/** A mention shown as its display name. `data-entry-key` lets the page open the entry's card on click. */
class MentionWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly key: string,
  ) {
    super();
  }
  override eq(other: MentionWidget) {
    return other.name === this.name && other.key === this.key;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-mention';
    span.dataset.entryKey = this.key;
    span.textContent = this.name;
    return span;
  }
}

const hidden = Decoration.replace({});

/** Hides scene markers and shows mentions as their display name. The cursor skips over both. */
export const hideMarkers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkers(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildMarkers(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (p) =>
      EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
  },
);

function buildMarkers(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      for (const m of findMarkers(line.text)) {
        if (m.kind === 'note') continue;
        const deco =
          m.kind === 'mention'
            ? Decoration.replace({ widget: new MentionWidget(m.name ?? '', m.key ?? '') })
            : hidden;
        // A scene marker also swallows the space before it, so the heading doesn't end in a gap.
        const start = m.kind === 'scene' && line.text[m.from - 1] === ' ' ? m.from - 1 : m.from;
        b.add(line.from + start, line.from + m.to, deco);
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

/** Everything the screenplay editor needs: line types, layout classes, hidden markers, Enter and Tab. */
export function fountain(): Extension {
  return [
    fountainLineTypes,
    fountainLineClasses,
    hideMarkers,
    Prec.high(
      keymap.of([
        { key: 'Enter', run: fountainEnter },
        { key: 'Tab', run: cycleElement },
      ]),
    ),
  ];
}
