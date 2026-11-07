'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { focusRing } from '@epic/ui';
import {
  buildGraph,
  familyTree,
  lineage,
  relationshipWeb,
  treeOptions,
  type Graph,
} from '../../lib/graph';
import { useLinkTypes, useTypes } from '../../lib/use-types';
import { useWorld } from '../../lib/use-world';
import { KIND_TITLE } from '../codex/EntryRelations';
import { useWorkspace } from '../Workspace';
import { GraphCanvas } from './GraphCanvas';

const VIEWS = [
  ['tree', 'Family trees'],
  ['web', 'Relationship web'],
  ['lineage', 'Lineage'],
] as const;
type View = (typeof VIEWS)[number][0];

const KIN = 'kin';
const control = `h-10 rounded-lg bg-sunk px-3 text-ink ${focusRing}`;

/**
 * Family trees, the relationship web and lineage (GR-1, 2, 3), resolved as of the workspace's
 * current point. `?view=`, `?tree=`, `?root=` and `?hops=` keep each view linkable.
 */
export function GraphViews() {
  const { projectId, asOf } = useWorkspace();
  const world = useWorld(projectId);
  const meta = useTypes(projectId);
  const linkTypes = useLinkTypes(projectId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const view: View = VIEWS.some(([v]) => v === params.get('view'))
    ? (params.get('view') as View)
    : 'tree';
  const hops = Math.min(4, Math.max(1, Number(params.get('hops')) || 2));
  const rootKey = params.get('root');

  const go = useCallback(
    (next: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(next)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      router.replace(`${pathname}?${p}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const openInCodex = useCallback(
    (key: string) => router.push(`/projects/${projectId}/codex?e=${key}`),
    [projectId, router],
  );
  const selectRoot = useCallback((key: string) => go({ root: key }), [go]);

  const types = useMemo(() => meta.data?.types ?? [], [meta.data]);
  const full = useMemo(
    () =>
      world.data && linkTypes.data
        ? buildGraph({ world: world.data, types, linkTypes: linkTypes.data, asOf })
        : null,
    [world.data, types, linkTypes.data, asOf],
  );
  const trees = useMemo(() => (full ? treeOptions(types, full) : []), [full, types]);
  const treeKey = params.get('tree') ?? trees[0]?.key ?? KIN;

  const shown: Graph | null = useMemo(() => {
    if (!full) return null;
    if (view === 'tree') return familyTree(full, treeKey === KIN ? null : treeKey);
    if (view === 'web')
      return relationshipWeb(
        full,
        new Set(types.map((t) => t.key).filter((k) => !hiddenTypes.has(k))),
        new Set(full.edges.map((e) => e.kind).filter((k) => !hiddenKinds.has(k))),
      );
    return rootKey ? lineage(full, rootKey, hops) : { nodes: [], edges: [] };
  }, [full, view, treeKey, types, hiddenTypes, hiddenKinds, rootKey, hops]);

  const error = world.error ?? meta.error ?? linkTypes.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load the graph: {error.message}
      </p>
    );
  if (!full || !shown) return <p className="p-8 text-muted">Opening the graph…</p>;

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = (i + step + VIEWS.length) % VIEWS.length;
    tabs.current[next]?.focus();
    go({ view: VIEWS[next]![0] });
  };
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  const kinds = [...new Set(full.edges.map((e) => e.kind))];
  const present = new Set(full.nodes.map((n) => n.typeKey));
  const root = full.nodes.find((n) => n.key === rootKey);
  const q = query.trim().toLowerCase();
  const matches = full.nodes
    .filter((n) => !q || n.name.toLowerCase().includes(q) || n.key === rootKey)
    .sort((a, b) => a.name.localeCompare(b.name));
  const viewName = VIEWS.find(([v]) => v === view)![1];

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Graph</h1>
      <div role="tablist" aria-label="Graph views" className="flex gap-1">
        {VIEWS.map(([v, name], i) => (
          <button
            key={v}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            id={`tab-${v}`}
            aria-selected={view === v}
            aria-controls="graph-panel"
            tabIndex={view === v ? 0 : -1}
            onClick={() => go({ view: v })}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`rounded-full px-4 py-1.5 text-sm ${focusRing} ${view === v ? 'bg-selected text-on-selected' : 'text-muted hover:bg-sunk hover:text-ink'}`}
          >
            {name}
          </button>
        ))}
      </div>

      <section
        id="graph-panel"
        role="tabpanel"
        aria-labelledby={`tab-${view}`}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {view === 'tree' && (
            <label className="flex items-center gap-2">
              Tree
              <select
                aria-label="Tree"
                value={treeKey}
                onChange={(e) => go({ tree: e.target.value })}
                className={control}
              >
                {trees.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
                <option value={KIN}>Everyone with family links</option>
              </select>
            </label>
          )}
          {view === 'web' && (
            <>
              <fieldset className="flex flex-wrap items-center gap-3">
                <legend className="sr-only">Entry types</legend>
                {types
                  .filter((t) => present.has(t.key))
                  .map((t) => (
                    <label key={t.key} className="flex items-center gap-1.5 text-muted">
                      <input
                        type="checkbox"
                        className="accent-ink"
                        checked={!hiddenTypes.has(t.key)}
                        onChange={() => setHiddenTypes((s) => toggle(s, t.key))}
                      />
                      {t.pluralName}
                    </label>
                  ))}
              </fieldset>
              <fieldset className="flex flex-wrap items-center gap-3">
                <legend className="sr-only">Connection kinds</legend>
                {kinds.map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-muted">
                    <input
                      type="checkbox"
                      className="accent-ink"
                      checked={!hiddenKinds.has(k)}
                      onChange={() => setHiddenKinds((s) => toggle(s, k))}
                    />
                    {KIND_TITLE[k] ?? k}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {view === 'lineage' && (
            <>
              <input
                type="search"
                aria-label="Search entries"
                placeholder="Search entries"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${control} w-48`}
              />
              <label className="flex items-center gap-2">
                Entry
                <select
                  aria-label="Entry"
                  value={root ? root.key : ''}
                  onChange={(e) => go({ root: e.target.value || null })}
                  className={control}
                >
                  <option value="">Pick an entry</option>
                  {matches.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Hops
                <select
                  aria-label="Hops"
                  value={hops}
                  onChange={(e) => go({ hops: e.target.value })}
                  className={control}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {root && (
                <Link
                  href={`/projects/${projectId}/codex?e=${root.key}`}
                  className={`rounded text-muted hover:text-ink ${focusRing}`}
                >
                  Open {root.name} in the codex
                </Link>
              )}
            </>
          )}
        </div>

        {shown.nodes.length === 0 ? (
          <p className="text-muted">
            {view === 'tree'
              ? 'No family to draw yet. Connect entries with family links, or add members to a dynasty.'
              : view === 'web'
                ? 'Nothing matches these filters.'
                : 'Pick an entry to see everything connected to it.'}
          </p>
        ) : (
          <GraphCanvas
            graph={shown}
            types={types}
            tree={view === 'tree'}
            selectedKey={view === 'lineage' ? rootKey : null}
            onOpen={view === 'lineage' ? selectRoot : openInCodex}
            label={viewName}
          />
        )}
      </section>
    </div>
  );
}
