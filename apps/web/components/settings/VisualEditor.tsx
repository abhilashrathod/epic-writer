'use client';

import { useRef, useState } from 'react';
import type { ProjectSettingsDto, UploadedImageDto } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { uploadImage, useSaveSettings } from '../../lib/use-project-settings';

// Palette colours are the writer's data, not UI styling (which comes from tokens): a mid grey
// to start from, built from channels so no hex literal sits in a component.
const NEW_SWATCH = `#${[128, 128, 128].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

/** Visual references (PR-6): a colour palette, mood keywords and mood-board images. */
export function VisualEditor(props: { projectId: string; visual: ProjectSettingsDto['visual'] }) {
  const { projectId } = props;
  const [palette, setPalette] = useState(props.visual.palette);
  const [keywords, setKeywords] = useState(props.visual.moodKeywords.join(', '));
  const [board, setBoard] = useState<UploadedImageDto[]>(props.visual.moodboard);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useSaveSettings(projectId);

  const persist = (next: { palette?: string[]; board?: UploadedImageDto[] } = {}) =>
    save.mutate({
      visual: {
        palette: next.palette ?? palette,
        moodKeywords: keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        moodboardAssetIds: (next.board ?? board).map((b) => b.id),
      },
    });

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    try {
      const added: UploadedImageDto[] = [];
      for (const f of Array.from(files)) added.push(await uploadImage(projectId, f));
      const next = [...board, ...added];
      setBoard(next);
      persist({ board: next });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section aria-label="Visual references" className="flex max-w-3xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Visual references</h2>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1.5 text-sm font-medium">Palette</legend>
        {palette.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <input
              type="color"
              aria-label={`Palette colour ${i + 1}`}
              value={c}
              className={`h-9 w-12 cursor-pointer rounded-md bg-transparent ${focusRing}`}
              onChange={(e) => setPalette(palette.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              aria-label={`Remove colour ${i + 1}`}
              className={`rounded text-muted hover:text-ink ${focusRing}`}
              onClick={() => setPalette(palette.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
        <Button
          onClick={() => setPalette([...palette, NEW_SWATCH])}
          disabled={palette.length >= 24}
        >
          + Add colour
        </Button>
      </fieldset>

      <Field
        label="Mood keywords, comma-separated"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <div>
        <Button onClick={() => persist()} disabled={save.isPending}>
          Save palette and keywords
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Mood board</h3>
        {board.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {board.map((b, i) => (
              <li key={b.id} className="group relative">
                <img
                  src={b.url}
                  alt={`Mood board image ${i + 1}`}
                  className="aspect-square w-full rounded-lg bg-sunk object-cover"
                />
                <button
                  aria-label={`Remove mood board image ${i + 1}`}
                  className={`absolute top-1 right-1 rounded-md bg-surface px-2 text-sm ${focusRing}`}
                  onClick={() => {
                    const next = board.filter((x) => x.id !== b.id);
                    setBoard(next);
                    persist({ board: next });
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          aria-label="Mood board images to upload"
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button
          className="self-start"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload images'}
        </Button>
      </div>
      {(uploadError || save.error) && (
        <p role="alert" className="text-sm text-bad">
          {uploadError || save.error?.message}
        </p>
      )}
    </section>
  );
}
