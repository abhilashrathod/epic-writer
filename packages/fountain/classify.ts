import { displayText } from './markers';

export type LineType =
  | 'blank'
  | 'sceneHeading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'section'
  | 'synopsis'
  | 'lyrics'
  | 'pageBreak'
  | 'note';

const SCENE_RE = /^(?:INT\.?\/EXT|INT|EXT|EST|I\/E)(?:\.|\s)/i;
const IN_DIALOGUE = new Set<LineType | null>(['character', 'parenthetical', 'dialogue']);

/** Name part of a cue, without extensions like (V.O.) or the dual-dialogue caret. */
function cueName(t: string): string {
  return t
    .replace(/\(.*?\)/g, '')
    .replace(/\^$/, '')
    .trim();
}

/** All caps with at least one cased letter, so scripts without case (Devanagari) never become cues. */
function isCaps(s: string): boolean {
  return /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s);
}

/**
 * Whether a line reads as a character cue, ignoring what follows it. The editor uses this while
 * typing, before the dialogue line exists.
 */
export function looksLikeCue(text: string, prev: LineType | null): boolean {
  const t = displayText(text).trim();
  if (t.startsWith('@')) return true;
  if (prev !== null && prev !== 'blank') return false;
  if (SCENE_RE.test(t) || /TO:$/.test(t) || /^[!.>~=#]/.test(t)) return false;
  return isCaps(cueName(t));
}

/**
 * Classifies one Fountain line from its neighbours: the previous line's type and the next line's
 * raw text (`null` at the end of the document). Markers are ignored.
 */
export function classifyLine(text: string, prev: LineType | null, next: string | null): LineType {
  const t = displayText(text).trim();
  if (t === '') return text.trim() === '' ? 'blank' : 'note';
  const prevBlank = prev === null || prev === 'blank';

  if (/^={3,}$/.test(t)) return 'pageBreak';
  if (t.startsWith('#')) return 'section';
  if (t.startsWith('=')) return 'synopsis';
  if (t.startsWith('!')) return 'action';
  if (/^\.[^.]/.test(t)) return 'sceneHeading';
  if (t.startsWith('@')) return 'character';
  if (t.startsWith('~')) return 'lyrics';
  if (t.startsWith('>')) return t.endsWith('<') ? 'centered' : 'transition';

  if (IN_DIALOGUE.has(prev))
    return t.startsWith('(') && t.endsWith(')') ? 'parenthetical' : 'dialogue';

  if (prevBlank) {
    if (SCENE_RE.test(t)) return 'sceneHeading';
    if (isCaps(t) && t.endsWith('TO:')) return 'transition';
    // A cue needs dialogue after it; at the very end of the text it's being typed, so allow it.
    const nextHasText = next === null || displayText(next).trim() !== '';
    if (nextHasText && isCaps(cueName(t))) return 'character';
  }
  return 'action';
}

/** Classifies every line of a Fountain text. */
export function classifyLines(lines: readonly string[]): LineType[] {
  const out: LineType[] = [];
  let prev: LineType | null = null;
  for (let i = 0; i < lines.length; i++) {
    prev = classifyLine(lines[i] ?? '', prev, i + 1 < lines.length ? (lines[i + 1] ?? '') : null);
    out.push(prev);
  }
  return out;
}
