import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { mentionCompletions, type MentionCandidate } from './mentions';

const CANDS: MentionCandidate[] = [
  { key: 'k-bh', name: 'Bhishma', aliases: ['Devavrata'], typeName: 'Character', speaker: true },
  { key: 'k-rb', name: 'River Bank', aliases: [], typeName: 'Place', speaker: false },
];

/** Runs the source with the cursor at `|`. */
function complete(
  textWithCursor: string,
  format: 'fountain' | 'markdown' = 'fountain',
  explicit = false,
) {
  const pos = textWithCursor.indexOf('|');
  const state = EditorState.create({
    doc: textWithCursor.replace('|', ''),
    selection: { anchor: pos },
  });
  const result = mentionCompletions(
    () => CANDS,
    format,
  )(new CompletionContext(state, pos, explicit));
  return { state, pos, result: result instanceof Promise ? null : result };
}

/** Applies an option the way CodeMirror would and returns the new text with `|` at the cursor. */
function apply(state: EditorState, option: Completion, from: number, to: number): string {
  let s = state;
  const view = {
    state,
    dispatch: (spec: Parameters<EditorState['update']>[0]) => (s = s.update(spec).state),
  } as unknown as EditorView;
  (option.apply as (v: EditorView, c: Completion, f: number, t: number) => void)(
    view,
    option,
    from,
    to,
  );
  const doc = s.doc.toString();
  const head = s.selection.main.head;
  return doc.slice(0, head) + '|' + doc.slice(head);
}

describe('mentionCompletions', () => {
  it('offers every name and alias after @, and inserts a keyed marker in place of the @text', () => {
    const { state, pos, result } = complete('He bows to @Dev|');
    expect(result?.options.map((o) => [o.label, o.detail])).toEqual([
      ['Bhishma', 'Character'],
      ['Devavrata', '→ Bhishma'],
      ['River Bank', 'Place'],
    ]);
    const alias = result!.options[1]!;
    expect(apply(state, alias, result!.from, pos)).toBe('He bows to [[@e:k-bh|Devavrata]]|');
  });

  it('ignores @ inside words such as e-mail addresses', () => {
    expect(complete('mail me@Dev|').result).toBeNull();
  });

  it('completes [[Name and leaves other notes alone', () => {
    const { state, pos, result } = complete('By the [[Riv|');
    expect(
      apply(
        state,
        result!.options.find((o) => o.label === 'River Bank')!,
        result!.from,
        pos,
      ),
    ).toBe('By the [[@e:k-rb|River Bank]]|');
    expect(complete('[[@s:abc|').result).toBeNull();
  });

  it('offers only speakers, in caps, for a cue after a blank line', () => {
    const { state, pos, result } = complete('Action.\n\nBHI|');
    expect(result?.options.map((o) => o.label)).toEqual(['BHISHMA', 'DEVAVRATA']);
    expect(apply(state, result!.options[0]!, result!.from, pos)).toBe(
      'Action.\n\n[[@e:k-bh|BHISHMA]]|',
    );
  });

  it('does not offer cues mid-paragraph, in lowercase, before other text, or in prose', () => {
    expect(complete('Action.\nBHI|').result).toBeNull();
    expect(complete('\nBhi|').result).toBeNull();
    expect(complete('\nBHI| waits').result).toBeNull();
    expect(complete('\nBHI|', 'markdown').result).toBeNull();
  });

  it('opens cue suggestions on an empty line only when asked explicitly', () => {
    expect(complete('x\n\n|').result).toBeNull();
    expect(complete('x\n\n|', 'fountain', true).result?.options).toHaveLength(2);
  });
});
