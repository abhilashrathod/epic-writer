'use client';

import { useState, type FormEvent } from 'react';
import { WORK_MEDIA } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { useTreeMutation } from '../lib/use-tree';
import { useWorkspace } from './Workspace';

const MEDIUM_LABEL: Record<(typeof WORK_MEDIA)[number], string> = {
  series: 'Series (seasons and episodes)',
  novel: 'Novel (chapters)',
  film: 'Film',
  trilogy: 'Trilogy (books and chapters)',
  short: 'Short',
  stage: 'Stage play',
  game: 'Game',
  other: 'Other',
};

export function NewWorkForm({ onDone }: { onDone?: () => void }) {
  const { projectId } = useWorkspace();
  const [name, setName] = useState('');
  const [medium, setMedium] = useState<(typeof WORK_MEDIA)[number]>('series');
  const create = useTreeMutation(projectId, () =>
    api(`/api/projects/${projectId}/works`, { method: 'POST', body: { name, medium } }),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(undefined, { onSuccess: () => onDone?.() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Work name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        maxLength={200}
        error={create.error?.message}
      />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Kind
        <select
          value={medium}
          onChange={(e) => setMedium(e.target.value as typeof medium)}
          className={`h-10 rounded-lg bg-sunk px-2 font-normal text-ink ${focusRing}`}
        >
          {WORK_MEDIA.map((m) => (
            <option key={m} value={m}>
              {MEDIUM_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
          Create work
        </Button>
        {onDone && <Button onClick={onDone}>Cancel</Button>}
      </div>
    </form>
  );
}
