'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { TypeTemplateDto } from '@epic/schemas/api';
import { Icon, TYPE_TEXT, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { typesKey } from '../../lib/use-types';
import { useWorkspace } from '../Workspace';

const typeColor = (c: string) => TYPE_TEXT[c as keyof typeof TYPE_TEXT];

function statusOf(t: TypeTemplateDto): string {
  if (!t.existingKey) return `${t.fieldCount} fields`;
  return t.missingFieldCount ? `In project · adds ${t.missingFieldCount} fields` : 'In project';
}

/** "Create from template": the type catalogue, by group, with search over names and fields. */
export function TemplatePicker() {
  const { projectId } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const codex = `/projects/${projectId}/codex`;
  const base = `/api/projects/${projectId}/type-templates`;
  const [query, setQuery] = useState('');
  const templates = useQuery({
    queryKey: ['typeTemplates', projectId],
    queryFn: () => api<{ templates: TypeTemplateDto[] }>(base).then((r) => r.templates),
  });
  const pick = useMutation({
    mutationFn: (id: string) => api<{ key: string }>(base, { method: 'POST', body: { id } }),
    onSuccess: async ({ key }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: typesKey(projectId) }),
        qc.invalidateQueries({ queryKey: ['typeTemplates', projectId] }),
      ]);
      router.push(`${codex}/new?type=${key}`);
    },
  });

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (templates.data ?? []).filter((t) => !q || t.search.includes(q));
    const nameHit = (t: TypeTemplateDto) => (t.name.toLowerCase().includes(q) ? 0 : 1);
    return [...new Set(matches.map((t) => t.group))].map((name) => ({
      name,
      items: matches.filter((t) => t.group === name).sort((a, b) => nameHit(a) - nameHit(b)),
    }));
  }, [templates.data, query]);

  return (
    <section
      aria-label="Create from template"
      className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6"
    >
      <Link href={codex} className={`self-start text-sm text-muted hover:text-ink ${focusRing}`}>
        ← Codex
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create from template</h1>
        <p className="mt-1 text-muted">Pick what you’re adding. You fill in the details next.</p>
      </div>
      <input
        type="search"
        aria-label="Search templates"
        placeholder="Search names and fields: hut, ashram, prison"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={`h-12 max-w-xl rounded-lg bg-sunk px-4 ${focusRing}`}
      />
      {templates.isPending && <p className="text-muted">Loading templates…</p>}
      {templates.error && (
        <p role="alert" className="text-bad">
          Couldn’t load templates: {templates.error.message}
        </p>
      )}
      {pick.error && (
        <p role="alert" className="text-bad">
          Couldn’t use that template: {pick.error.message}
        </p>
      )}
      {templates.data && groups.length === 0 && (
        <p className="text-muted">No templates match “{query.trim()}”. Try another word.</p>
      )}
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{g.name}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {g.items.map((t) => (
              <li key={t.id}>
                <button
                  disabled={pick.isPending}
                  onClick={() => pick.mutate(t.id)}
                  className={`flex h-full w-full flex-col gap-1 rounded-xl bg-panel p-4 text-left hover:bg-sunk disabled:opacity-60 ${focusRing}`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Icon name={t.icon} className={`shrink-0 text-lg ${typeColor(t.color)}`} />
                    {t.name}
                  </span>
                  <span className="text-xs text-muted">{t.templates.join(' · ')}</span>
                  <span className="text-xs text-muted">{statusOf(t)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
