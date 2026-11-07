import { Invalid } from '@epic/core';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';

/**
 * Server-only: turns an uploaded note (IO-1) into plain text or Markdown. Markdown and text pass
 * through; Word paragraphs and PDF pages become blank-line-separated blocks.
 */
export async function parseNote(name: string, bytes: Uint8Array): Promise<string> {
  const ext = /\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? '';
  let text: string;
  try {
    if (ext === '.docx') {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else if (ext === '.pdf') {
      text = (await extractText(new Uint8Array(bytes))).text.join('\n\n');
    } else {
      text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    }
  } catch {
    throw new Invalid(`Couldn't read "${name}". Check that it opens and isn't password-protected.`);
  }
  if (!text.trim()) {
    throw new Invalid(
      ext === '.pdf'
        ? `"${name}" has no text to import. Scanned PDFs need text recognition (OCR) first.`
        : `"${name}" has no text to import`,
    );
  }
  return text;
}
