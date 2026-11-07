'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, TYPE_BG, focusRing } from '@epic/ui';
import { TYPE_COLORS } from '@epic/schemas/api';
import type { StorylineDto } from '@epic/schemas/storylines';
import { api } from '../../lib/api-client';
import { scenesKey, storylinesKey } from '../../lib/use-story';

/**
 * Creates a storyline, or renames, recolours and deletes an existing one. A new storyline belongs
 * to the work on screen unless "every work" is ticked.
 */
export function StorylineForm(props: {
  projectId: string;
  workKey: string;
  existing?: StorylineDto;
  onDone: (key: string | null) => void;
}) {
  const { projectId, existing } = props;
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? 'cat-1');
  const [allWorks, setAllWorks] = useState(existing ? existing.workKey === null : false);
  const base = `/api/projects/${projectId}/storylines`;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: storylinesKey(projectId) }),
      qc.invalidateQueries({ queryKey: scenesKey(projectId) }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { name, color, workKey: allWorks ? null : (existing?.workKey ?? props.workKey) };
      if (!existing) return (await api<{ key: string }>(base, { method: 'POST', body })).key;
      await api(`${base}/${existing.key}`, { method: 'PATCH', body });
      return existing.key;
    },
    onSuccess: async (key) => {
      await refresh();
      props.onDone(key);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`${base}/${existing!.key}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      props.onDone(null);
    },
  });
  const error = save.error ?? remove.error;

  return (
    <form
      aria-label={existing ? `Edit ${existing.name}` : 'New storyline'}
      className="flex flex-col gap-3 rounded-xl bg-panel p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Karna’s thread"
          className={`h-10 rounded-lg bg-surface px-3 ${focusRing}`}
          required
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 text-muted">Colour</legend>
        <div className="flex gap-2">
          {TYPE_COLORS.map((c, i) => (
            <label key={c} className="relative">
              <input
                type="radio"
                name="storyline-color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                aria-label={`Colour ${i + 1}`}
                className="peer sr-only"
              />
              <span
                className={`block size-6 rounded-full ${TYPE_BG[c]} peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-checked:ring-offset-panel peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus`}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={allWorks} onChange={(e) => setAllWorks(e.target.checked)} />
        Runs through every work
      </label>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={existing ? 'quiet' : 'primary'} disabled={save.isPending}>
          {existing ? 'Save changes' : 'Create storyline'}
        </Button>
        <Button onClick={() => props.onDone(existing?.key ?? null)}>Cancel</Button>
        {existing && (
          <Button
            className="ml-auto text-bad hover:text-bad"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            Delete storyline
          </Button>
        )}
      </div>
    </form>
  );
}
