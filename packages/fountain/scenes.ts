import { classifyLines } from './classify';
import { displayText, findMarkers, sceneMarker } from './markers';

export type TextFormat = 'fountain' | 'markdown';

export interface SceneSpan {
  /** Key from the scene marker, or null if the scene has none yet. */
  key: string | null;
  /** Heading as the reader sees it. */
  heading: string;
  /** Character offsets: the scene runs from its first line to the next scene (or the end). */
  from: number;
  to: number;
  /** 0-based line of the scene's first (heading) line. */
  line: number;
}

const MD_BREAK_RE = /^\s*(?:\*\s*){3,}$/;

interface Line {
  text: string;
  from: number;
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let from = 0;
  for (const t of text.split('\n')) {
    out.push({ text: t, from });
    from += t.length + 1;
  }
  return out;
}

function sceneKeyIn(text: string): string | null {
  return findMarkers(text).find((m) => m.kind === 'scene')?.key ?? null;
}

/** Index of each scene's first line. Fountain: scene headings. Markdown: text start and each `***` break. */
function sceneStarts(lines: Line[], format: TextFormat): number[] {
  if (format === 'fountain') {
    const types = classifyLines(lines.map((l) => l.text));
    return types.flatMap((t, i) => (t === 'sceneHeading' ? [i] : []));
  }
  const starts: number[] = [];
  let seekFrom = 0;
  for (let i = 0; i <= lines.length; i++) {
    const atBreak = i === lines.length || MD_BREAK_RE.test(lines[i]?.text ?? '');
    if (!atBreak) continue;
    // A Markdown scene starts at its first non-blank line; empty stretches are not scenes.
    const first = lines.slice(seekFrom, i).findIndex((l) => l.text.trim() !== '');
    if (first >= 0) starts.push(seekFrom + first);
    seekFrom = i + 1;
  }
  return starts;
}

/** Scenes in document order, with their keys (if marked) and ranges. */
export function extractScenes(text: string, format: TextFormat): SceneSpan[] {
  const lines = splitLines(text);
  const starts = sceneStarts(lines, format);
  return starts.map((start, i) => {
    const line = lines[start]!;
    const nextStart = starts[i + 1];
    let to = nextStart === undefined ? text.length : lines[nextStart]!.from;
    if (format === 'markdown' && nextStart !== undefined) {
      // End the scene before the `***` break that precedes the next one.
      let j = nextStart - 1;
      while (j > start && !MD_BREAK_RE.test(lines[j]!.text)) j--;
      if (j > start) to = lines[j]!.from;
    }
    const heading = displayText(line.text)
      .trim()
      .replace(/^[.#]+\s*/, '');
    return { key: sceneKeyIn(line.text), heading, from: line.from, to, line: start };
  });
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * Edits that give every scene a unique key marker: unmarked scenes get a new one, and a key already
 * used by an earlier scene (a pasted copy) is replaced. Edits are in document order and don't
 * overlap, so an editor can apply them as one change set without moving the cursor.
 */
export function sceneKeyEdits(text: string, format: TextFormat, newKey: () => string): TextEdit[] {
  const lines = splitLines(text);
  const seen = new Set<string>();
  const edits: TextEdit[] = [];
  for (const scene of extractScenes(text, format)) {
    if (scene.key && !seen.has(scene.key)) {
      seen.add(scene.key);
      continue;
    }
    const line = lines[scene.line]!;
    const key = newKey();
    seen.add(key);
    const stripped = scene.key ? line.text.replace(sceneMarker(scene.key, format), '') : line.text;
    edits.push({
      from: line.from,
      to: line.from + line.text.length,
      insert: `${stripped.trimEnd()} ${sceneMarker(key, format)}`,
    });
  }
  return edits;
}

/** `text` with sceneKeyEdits applied. Returns the same string when nothing was missing. */
export function assignSceneKeys(text: string, format: TextFormat, newKey: () => string): string {
  let out = text;
  for (const e of sceneKeyEdits(text, format, newKey).reverse()) {
    out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  }
  return out;
}
