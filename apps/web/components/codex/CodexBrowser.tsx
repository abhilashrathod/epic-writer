'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { lifeAt } from '@epic/core/asof';
import type { EntityDto } from '@epic/schemas/api';
import { Icon, TYPE_TEXT, focusRing } from '@epic/ui';
import { useEntities, useTypes } from '../../lib/use-types';
import { useWorkspace } from '../Workspace';
import { primaryImage } from './EntryImages';
import { EntryCard } from './EntryCard';
import { EntryDetail } from './EntryDetail';

/**
 * The codex browser (CX-6): types grouped in a sidebar, a card grid sorted by prominence (events by
 * date), and a detail pane. `?type=` filters and `?e=` opens an entry, so links can point anywhere.
 */
export function CodexBrowser() {
  const { projectId, asOf } = useWorkspace();
  const meta = useTypes(projectId);
  const entities = useEntities(projectId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [showScrapped, setShowScrapped] = useState(false);

  const typeFilter = params.get('type');
  const openKey = params.get('e');
  const go = (next: { type?: string | null; e?: string | null }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  const all = useMemo(() => entities.data ?? [], [entities.data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (e) =>
        (showScrapped || e.canonState !== 'scrapped') &&
        (!typeFilter || e.typeKey === typeFilter) &&
        (!q ||
          e.name.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q))),
    );
  }, [all, query, showScrapped, typeFilter]);

  const codex = `/projects/${projectId}/codex`;
  const primaryLink = `rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary ${focusRing}`;

  if (meta.isPending || entities.isPending)
    return <p className="p-8 text-muted">Opening the codex…</p>;
  const error = meta.error ?? entities.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load the codex: {error.message}
      </p>
    );
  const types = meta.data!.types;
  const open = all.find((e) => e.key === openKey) ?? null;
  const lifeOf = (e: EntityDto) => {
    const t = types.find((x) => x.key === e.typeKey);
    return t?.traits.includes('born')
      ? lifeAt(meta.data!.calendar, t.fields, e.fields, asOf.storyTime)
      : undefined;
  };
  const counts = new Map<string, number>();
  for (const e of all)
    if (e.canonState !== 'scrapped') counts.set(e.typeKey, (counts.get(e.typeKey) ?? 0) + 1);

  if (types.length === 0)
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Codex</h1>
        <p className="text-muted">Entries need a type first: a character, a place, a weapon.</p>
        <Link href={`${codex}/templates`} className={`self-start ${primaryLink}`}>
          Create from template
        </Link>
        <Link
          href={`${codex}/types`}
          className={`self-start text-sm text-muted hover:text-ink ${focusRing}`}
        >
          Create an entry type yourself
        </Link>
      </div>
    );

  const typeButton = (key: string | null, label: React.ReactNode, count?: number) => (
    <button
      key={key ?? 'all'}
      onClick={() => go({ type: key })}
      aria-current={typeFilter === key ? 'true' : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${focusRing} ${typeFilter === key ? 'bg-selected text-on-selected' : 'hover:bg-sunk'}`}
    >
      {label}
      {count !== undefined && <span className="ml-auto text-xs opacity-60">{count}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 px-6 py-6 xl:flex-row xl:items-start">
      <nav aria-label="Entry types" className="flex w-full shrink-0 flex-col gap-3 xl:w-56">
        <h1 className="text-xl font-semibold tracking-tight">Codex</h1>
        {typeButton(
          null,
          <span>All entries</span>,
          all.filter((e) => e.canonState !== 'scrapped').length,
        )}
        {meta.data!.groups.map((g) => {
          const inGroup = types.filter((t) => t.group === g.key);
          if (!inGroup.length) return null;
          return (
            <section key={g.key} aria-label={g.name} className="flex flex-col gap-0.5">
              <p className="px-2 text-xs font-medium uppercase tracking-wide text-faint">
                {g.name}
              </p>
              {inGroup.map((t) =>
                typeButton(
                  t.key,
                  <>
                    <Icon
                      name={t.icon}
                      className={typeFilter === t.key ? '' : TYPE_TEXT[t.color]}
                    />
                    <span className="truncate">{t.pluralName}</span>
                  </>,
                  counts.get(t.key) ?? 0,
                ),
              )}
            </section>
          );
        })}
        <Link
          href={`/projects/${projectId}/codex/types`}
          className="px-2 text-sm text-muted hover:text-ink"
        >
          Edit entry types
        </Link>
        <Link
          href={`/projects/${projectId}/ask`}
          className="px-2 text-sm text-muted hover:text-ink"
        >
          Ask the codex
        </Link>
        <Link
          href={`/projects/${projectId}/import`}
          className={`px-2 text-sm text-muted hover:text-ink ${focusRing}`}
        >
          Import notes
        </Link>
      </nav>

      <section aria-label="Entries" className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            aria-label="Search entries"
            placeholder="Search entries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`h-10 min-w-48 flex-1 rounded-lg bg-sunk px-3 ${focusRing}`}
          />
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={showScrapped}
              onChange={(e) => setShowScrapped(e.target.checked)}
            />{' '}
            Show scrapped
          </label>
          <Link
            href={`${codex}/templates`}
            className={`rounded-md px-3 py-2 text-sm text-muted hover:text-ink ${focusRing}`}
          >
            Create from template
          </Link>
          <Link
            href={`${codex}/new${typeFilter ? `?type=${typeFilter}` : ''}`}
            className={primaryLink}
          >
            New entry
          </Link>
        </div>
        {visible.length === 0 ? (
          <p className="text-muted">
            {all.length
              ? 'No entries match.'
              : 'No entries yet. Add the people, places and things of your world.'}
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
            {visible.map((e) => (
              <li key={e.key}>
                <button
                  onClick={() => go({ e: e.key })}
                  className={`block h-full w-full rounded-xl text-left ${focusRing}`}
                  aria-pressed={openKey === e.key}
                >
                  <EntryCard
                    entry={e}
                    type={types.find((t) => t.key === e.typeKey)}
                    selected={openKey === e.key}
                    life={lifeOf(e)}
                    imageUrl={primaryImage(projectId, e)}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <aside
          aria-label={open.name}
          className="w-full shrink-0 rounded-xl bg-panel p-4 xl:sticky xl:top-6 xl:w-96"
        >
          <EntryDetail
            projectId={projectId}
            entry={open}
            meta={meta.data!}
            entries={all}
            onOpen={(k) => go({ e: k })}
            onEdit={() => router.push(`${codex}/${open.key}/edit`)}
          />
        </aside>
      )}
    </div>
  );
}
