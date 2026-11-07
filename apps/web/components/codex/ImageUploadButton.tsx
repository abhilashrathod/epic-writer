'use client';

import { useRef, useState } from 'react';
import type { UploadedImageDto } from '@epic/schemas/api';
import { Button } from '@epic/ui';
import { uploadImage } from '../../lib/use-project-settings';

/** Picks image files and uploads them to project storage, one by one. */
export function ImageUploadButton(props: {
  projectId: string;
  label: string;
  multiple?: boolean;
  onUploaded: (images: UploadedImageDto[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const out: UploadedImageDto[] = [];
      for (const f of Array.from(files)) out.push(await uploadImage(props.projectId, f));
      props.onUploaded(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <span className="flex flex-col gap-1">
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple={props.multiple}
        aria-label={`${props.label}: choose files`}
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
      />
      <Button className="self-start" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? 'Uploading…' : props.label}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
