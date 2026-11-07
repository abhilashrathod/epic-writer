import { displayText } from './markers';
import type { TextFormat } from './scenes';

/** Screenplay pages hold about 55 lines; prose pages about 250 words. */
const LINES_PER_PAGE = 55;
const WORDS_PER_PAGE = 250;

export interface TextStats {
  wordCount: number;
  pageCount: number;
  /** Rough running time in seconds: a screenplay page is a minute; prose is read aloud at 150 wpm. */
  estDuration: number;
}

export function textStats(text: string, format: TextFormat): TextStats {
  const visible = displayText(text);
  const wordCount = visible.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  if (wordCount === 0) return { wordCount: 0, pageCount: 0, estDuration: 0 };
  if (format === 'fountain') {
    const pages = visible.split('\n').length / LINES_PER_PAGE;
    return {
      wordCount,
      pageCount: Math.max(1, Math.round(pages)),
      estDuration: Math.round(pages * 60),
    };
  }
  return {
    wordCount,
    pageCount: Math.max(1, Math.round(wordCount / WORDS_PER_PAGE)),
    estDuration: Math.round((wordCount / 150) * 60),
  };
}
