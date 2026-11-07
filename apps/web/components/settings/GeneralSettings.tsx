'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ProjectSettingsDto } from '@epic/schemas/api';
import { Button, Field } from '@epic/ui';
import { useSaveSettings } from '../../lib/use-project-settings';

/** Rename and archive the project (PR-1). */
export function GeneralSettings({
  projectId,
  settings,
}: {
  projectId: string;
  settings: ProjectSettingsDto;
}) {
  const router = useRouter();
  const [name, setName] = useState(settings.name);
  const save = useSaveSettings(projectId);
  const run = (body: object) => save.mutate(body, { onSuccess: () => router.refresh() });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run({ name });
  };

  return (
    <section aria-label="Project" className="flex max-w-xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Project</h2>
      {settings.archived && (
        <p className="rounded-lg bg-panel px-3 py-2 text-sm">
          This project is archived. It’s hidden from your project list until you restore it.
        </p>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <Field
          label="Project name"
          className="flex-1"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={save.isPending || !name.trim() || name === settings.name}>
          Rename project
        </Button>
      </form>
      <div>
        <Button onClick={() => run({ archived: !settings.archived })} disabled={save.isPending}>
          {settings.archived ? 'Restore project' : 'Archive project'}
        </Button>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-bad">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
