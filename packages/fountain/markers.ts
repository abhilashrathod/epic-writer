// Stored text carries identity markers the editor hides and exporters strip:
//   scene:   Fountain `[[@s:<key>]]`, Markdown `<!-- s:<key> -->`
//   mention: `[[@e:<key>|Display Name]]` (both formats)
// Other `[[...]]` are ordinary Fountain notes, kept on export.

export type MarkerKind = 'scene' | 'mention' | 'note';

export interface Marker {
  kind: MarkerKind;
  from: number;
  to: number;
  key?: string;
  /** Mention display name, and where it sits inside the marker. */
  name?: string;
  nameFrom?: number;
}

const MARKER_RE =
  /\[\[@s:([\w-]+)\]\]|<!-- s:([\w-]+) -->|\[\[@e:([\w-]+)\|([^\]\n]*)\]\]|\[\[(?!@)[^\n]*?\]\]/g;

/** All markers in one line (or any string), in order. */
export function findMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const from = m.index;
    const to = from + m[0].length;
    const sceneKey = m[1] ?? m[2];
    if (sceneKey) out.push({ kind: 'scene', from, to, key: sceneKey });
    else if (m[3]) {
      out.push({
        kind: 'mention',
        from,
        to,
        key: m[3],
        name: m[4] ?? '',
        nameFrom: to - 2 - (m[4] ?? '').length,
      });
    } else out.push({ kind: 'note', from, to });
  }
  return out;
}

function replaceMarkers(text: string, keepNotes: boolean): string {
  return text.replace(
    MARKER_RE,
    (all, _s, _ms, mentionKey: string | undefined, name: string | undefined) => {
      if (mentionKey) return name ?? '';
      if (all.startsWith('[[') && !all.startsWith('[[@s:')) return keepNotes ? all : '';
      return '';
    },
  );
}

/** What the reader sees: mentions become names; scene markers and notes disappear. */
export function displayText(text: string): string {
  return replaceMarkers(text, false);
}

/** For export: scene markers removed, mentions become names, notes kept. Trailing spaces left by markers are trimmed. */
export function stripMarkers(text: string): string {
  return replaceMarkers(text, true).replace(/[ \t]+$/gm, '');
}

export function sceneMarker(key: string, format: 'fountain' | 'markdown'): string {
  return format === 'fountain' ? `[[@s:${key}]]` : `<!-- s:${key} -->`;
}

export function mentionMarker(key: string, name: string): string {
  return `[[@e:${key}|${name.replace(/[\]|\n]/g, '')}]]`;
}
