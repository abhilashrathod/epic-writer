'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { TEMPLATE_INFO, TEMPLATE_KEYS, type ProjectDto, type TemplateKey } from '@epic/schemas/api';
import { Button, Card, Field } from '@epic/ui';
import { api } from '../lib/api-client';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function ProjectList() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('mythological');

  const list = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: ProjectDto[] }>('/api/projects'),
  });
  const create = useMutation({
    mutationFn: (projectName: string) =>
      api<{ project: ProjectDto }>('/api/projects', {
        method: 'POST',
        body: { name: projectName, templateKey },
      }),
    onSuccess: async () => {
      setName('');
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(name);
  }

  const restore = useMutation({
    mutationFn: (id: string) =>
      api(`/api/projects/${id}/settings`, { method: 'PATCH', body: { archived: false } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const all = list.data?.projects ?? [];
  const projects = all.filter((p) => !p.archived);
  const archived = all.filter((p) => p.archived);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            New project
          </Button>
        )}
      </div>

      {creating && (
        <Card className="bg-panel">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Northern Kingdoms"
              autoFocus
              maxLength={200}
              error={create.error?.message}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">Start from</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEMPLATE_KEYS.map((k) => (
                  <label
                    key={k}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-lg p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${templateKey === k ? 'bg-selected text-on-selected' : 'bg-surface'}`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={k}
                      checked={templateKey === k}
                      onChange={() => setTemplateKey(k)}
                      className="sr-only"
                    />
                    <span className="font-medium">{TEMPLATE_INFO[k].name}</span>
                    <span className={templateKey === k ? 'opacity-80' : 'text-muted'}>
                      {TEMPLATE_INFO[k].description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
                {create.isPending ? 'Creating…' : 'Create project'}
              </Button>
              <Button onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {list.isPending && <p className="text-muted">Loading projects…</p>}
      {list.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          Couldn’t load projects: {list.error.message}
        </p>
      )}

      {list.isSuccess && all.length === 0 && !creating && (
        <Card className="flex flex-col gap-2 py-10 text-center">
          <p className="font-medium">No projects yet</p>
          <p className="text-muted">A project is a world: one codex, any number of works.</p>
        </Card>
      )}

      {projects.length > 0 && (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Card className="flex items-baseline justify-between gap-4">
                <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                <span className="text-sm text-muted">
                  {dateFormat.format(new Date(p.createdAt))} · {p.commitCount}{' '}
                  {p.commitCount === 1 ? 'commit' : 'commits'}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section aria-label="Archived projects" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">Archived</h2>
          <ul className="flex flex-col gap-1">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-1">
                <Link href={`/projects/${p.id}`} className="text-muted hover:underline">
                  {p.name}
                </Link>
                <Button onClick={() => restore.mutate(p.id)} disabled={restore.isPending}>
                  Restore {p.name}
                </Button>
              </li>
            ))}
          </ul>
          {restore.error && (
            <p role="alert" className="text-sm text-bad">
              Couldn’t restore: {restore.error.message}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
