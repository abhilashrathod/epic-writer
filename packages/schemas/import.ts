import { z } from 'zod';

/** IO-1: the note formats the import page accepts. */
export const IMPORT_EXTENSIONS = ['.md', '.markdown', '.txt', '.docx', '.pdf'] as const;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const extensionOf = (name: string) => /\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? '';

/** One uploaded note file (the `file` field of the multipart import request). */
export const importFileInput = z
  .instanceof(File, { message: 'Choose a file to import' })
  .refine((f) => (IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(f.name)), {
    message: 'Import Markdown, text, Word (.docx) or PDF files',
  })
  .refine((f) => f.size <= MAX_IMPORT_BYTES, {
    message: 'Files must be 10 MB or smaller. Split larger notes before importing.',
  });

/** Where an imported note is on its way into the codex. */
export type ImportedNoteState = 'new' | 'extracting' | 'failed' | 'review' | 'reviewed';

export interface ImportedNoteDto {
  documentKey: string;
  title: string;
  state: ImportedNoteState;
  /** Why the last extraction failed, when it did. */
  error: string | null;
  /** Proposed changes still waiting for review, across the note's extraction runs. */
  pending: number;
  /** The run to review next: the newest with open changes, else the newest. */
  proposalId: string | null;
}

export interface ImportStatusDto {
  workKey: string | null;
  notes: ImportedNoteDto[];
  /** What finished extraction runs on these notes cost; null when a model's price is unknown. */
  costMicros: number | null;
}
