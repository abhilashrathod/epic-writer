import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { mentionMarker } from './markers';
import type { TextFormat } from './scenes';

/** An entry the writer can mention. `speaker` entries (types with the `born` trait) can be cues. */
export interface MentionCandidate {
  key: string;
  name: string;
  aliases: string[];
  typeName: string;
  speaker: boolean;
}

const NAME_CHARS = "[\\p{L}\\p{M}\\p{N}'’.-]";
const AT_RE = new RegExp(`@${NAME_CHARS}*(?: ${NAME_CHARS}*){0,2}$`, 'u');
const BRACKET_RE = /\[\[(?!@)[^\]\n]*$/;
const CUE_RE = /^[\p{Lu}\p{N}][\p{Lu}\p{M}\p{N} .'’-]*$/u;

/**
 * One option per name and alias, so typing an alias finds the entry ("Devavrata" offers Bhishma).
 * `insert` builds the marker; `back` is how many trigger characters before `from` it replaces.
 */
function options(
  cands: MentionCandidate[],
  back: number,
  display: (label: string) => string,
): Completion[] {
  return cands.flatMap((c) =>
    [c.name, ...c.aliases].map((label) => ({
      label: display(label),
      detail: label === c.name ? c.typeName : `→ ${c.name}`,
      apply: (view: EditorView, _c: Completion, from: number, to: number) => {
        const insert = mentionMarker(c.key, display(label));
        view.dispatch({
          changes: { from: from - back, to, insert },
          selection: { anchor: from - back + insert.length },
        });
      },
    })),
  );
}

/**
 * Autocomplete for mentions (ED-4, ED-6): `@Name` and `[[Name` anywhere, and in screenplays a
 * capitalised line after a blank line offers characters as the cue. Choosing inserts a mention
 * marker keyed to the entry, so it survives renames.
 */
export function mentionCompletions(
  get: () => MentionCandidate[],
  format: TextFormat,
): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const at = ctx.matchBefore(AT_RE);
    // `@` must start a word, so e-mail addresses don't trigger it.
    if (at && (at.from === 0 || !/[\p{L}\p{N}]/u.test(ctx.state.sliceDoc(at.from - 1, at.from)))) {
      return {
        from: at.from + 1,
        options: options(get(), 1, (l) => l),
        validFor: new RegExp(`^${NAME_CHARS}*$`, 'u'),
      };
    }
    const br = ctx.matchBefore(BRACKET_RE);
    if (br) return { from: br.from + 2, options: options(get(), 2, (l) => l) };

    if (format !== 'fountain') return null;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const prevBlank = line.number === 1 || ctx.state.doc.line(line.number - 1).text.trim() === '';
    const rest = line.text.slice(ctx.pos - line.from).trim();
    if (!prevBlank || rest || !(CUE_RE.test(before) || (ctx.explicit && before === '')))
      return null;
    const speakers = get().filter((c) => c.speaker);
    if (!speakers.length) return null;
    return { from: line.from, options: options(speakers, 0, (l) => l.toUpperCase()) };
  };
}
