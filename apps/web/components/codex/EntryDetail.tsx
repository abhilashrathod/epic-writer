'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatPoint, lifeAt, resolveFields } from '@epic/core/asof';
import type { EntityDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { entitiesKey, useLinkTypes, type TypesData } from '../../lib/use-types';
import { worldKey, useWorld } from '../../lib/use-world';
import { useWorkspace } from '../Workspace';
import { EntryChanges } from './EntryChanges';
import { EntryDiagram } from './EntryDiagram';
import { EntryHistory } from './EntryHistory';
import { EntryCard } from './EntryCard';
import { assetUrl, primaryImage } from './EntryImages';
import { EntryRelations } from './EntryRelations';
import { FieldValue } from './FieldValue';

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** The detail pane for one entry: card, fields, and edit / merge / delete. */
export function EntryDetail(props: {
  projectId: string;
  entry: EntityDto;
  meta: TypesData;
  entries: EntityDto[];
  onOpen: (key: string | null) => void;
  onEdit: () => void;
}) {
  const { entry } = props;
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'merge' | 'delete'>('view');
  const [mergeKey, setMergeKey] = useState('');
  const type = props.meta.types.find((t) => t.key === entry.typeKey);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: entitiesKey(props.projectId) }),
      qc.invalidateQueries({ queryKey: worldKey(props.projectId) }),
    ]);
  const { asOf } = useWorkspace();
  const world = useWorld(props.projectId);
  const linkTypes = useLinkTypes(props.projectId);
  const facts = useMemo(
    () =>
      (world.data?.facts ?? [])
        .filter((f) => f.entityKey === entry.key)
        .sort((a, b) => a.storyTime.start - b.storyTime.start),
    [world.data, entry.key],
  );
  // Time-varying fields show their value at the current point (CX-3, GR-5).
  const values = resolveFields(entry.fields, facts, asOf);
  const cal = props.meta.calendar;
  const asOfLabel =
    asOf.storyTime !== null && cal ? `as of ${formatPoint(cal, asOf.storyTime)}` : null;
  const life = type?.traits.includes('born')
    ? lifeAt(cal, type.fields, values, asOf.storyTime)
    : undefined;
  const base = `/api/projects/${props.projectId}/entities`;

  const remove = useMutation({
    mutationFn: () => api(`${base}/${entry.key}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      props.onOpen(null);
    },
  });
  const merge = useMutation({
    mutationFn: () =>
      api<{ textsUpdated: number }>(`${base}/merge`, {
        method: 'POST',
        body: { keepKey: entry.key, mergeKey },
      }),
    onSuccess: async () => {
      setMode('view');
      setMergeKey('');
      await refresh();
    },
  });

  const shown = (type?.fields ?? []).filter((f) => !isEmpty(values[f.key]));
  const duplicates = props.entries.filter((e) => e.key !== entry.key);

  return (
    <article aria-label={entry.name} className="flex flex-col gap-4">
      <EntryCard
        entry={entry}
        type={type}
        life={life}
        imageUrl={primaryImage(props.projectId, entry)}
      />
      {entry.images.length > 1 && (
        <ul aria-label="Images" className="grid grid-cols-3 gap-2">
          {entry.images.map((img, i) => (
            <li key={img.assetId}>
              <figure className="flex flex-col gap-1">
                <img
                  src={assetUrl(props.projectId, img.assetId)}
                  alt={img.caption || `${entry.name} image ${i + 1}`}
                  className="aspect-square w-full rounded-lg bg-sunk object-cover"
                />
                {img.caption && (
                  <figcaption className="text-xs text-muted">{img.caption}</figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        <Button onClick={props.onEdit}>Edit</Button>
        <Button
          onClick={() => setMode(mode === 'merge' ? 'view' : 'merge')}
          aria-expanded={mode === 'merge'}
        >
          Merge a duplicate…
        </Button>
        <Button className="text-bad" onClick={() => setMode('delete')}>
          Delete…
        </Button>
      </div>

      {mode === 'merge' && (
        <div className="flex flex-col gap-2 rounded-lg bg-panel p-3 text-sm">
          <label className="flex flex-col gap-1.5 font-medium">
            Merge this duplicate into “{entry.name}”
            <select
              aria-label="Duplicate to merge"
              className={`h-10 rounded-lg bg-sunk px-3 font-normal ${focusRing}`}
              value={mergeKey}
              onChange={(e) => setMergeKey(e.target.value)}
            >
              <option value="">Pick an entry…</option>
              {duplicates.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted">
            Its name becomes an alias here, empty fields are filled from it, and every reference and
            mention moves here. Then it is deleted.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!mergeKey || merge.isPending}
              onClick={() => merge.mutate()}
            >
              Merge into {entry.name}
            </Button>
            <Button onClick={() => setMode('view')}>Cancel</Button>
          </div>
          {merge.error && <p className="text-bad">{merge.error.message}</p>}
        </div>
      )}
      {mode === 'delete' && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-bad-soft p-3 text-sm">
          <span>
            Delete “{entry.name}”? References to it will show as deleted. Prefer “scrapped” to keep
            it out of views but on record.
          </span>
          <div className="flex gap-2">
            <button
              className={`rounded-md bg-bad px-2 py-1 font-medium text-surface ${focusRing}`}
              onClick={() => remove.mutate()}
            >
              Delete {entry.name}
            </button>
            <Button onClick={() => setMode('view')}>Cancel</Button>
          </div>
          {remove.error && <span>{remove.error.message}</span>}
        </div>
      )}

      <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Prominence</dt>
        <dd>{entry.prominence}</dd>
        {shown.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-muted">
              {f.label}
              {f.timeVarying && asOfLabel && (
                <span className="block text-xs text-faint">{asOfLabel}</span>
              )}
            </dt>
            <dd>
              <FieldValue
                field={f}
                value={values[f.key]}
                calendar={props.meta.calendar}
                units={props.meta.units}
                entries={props.entries}
                onOpen={props.onOpen}
              />
            </dd>
          </div>
        ))}
      </dl>
      {type && (
        <EntryChanges
          projectId={props.projectId}
          entry={entry}
          type={type}
          meta={props.meta}
          entries={props.entries}
          onOpen={props.onOpen}
        />
      )}
      {type && world.data && type.traits.includes('institution') && (
        <EntryHistory
          entry={entry}
          world={world.data}
          types={props.meta.types}
          asOf={asOf}
          calendar={props.meta.calendar}
          onOpen={props.onOpen}
        />
      )}
      {type &&
        world.data &&
        linkTypes.data &&
        (type.traits.includes('institution') || type.traits.includes('geo')) && (
          <EntryDiagram
            entry={entry}
            type={type}
            world={world.data}
            types={props.meta.types}
            linkTypes={linkTypes.data}
            asOf={asOf}
            onOpen={props.onOpen}
          />
        )}
      <EntryRelations
        projectId={props.projectId}
        entry={entry}
        entries={props.entries}
        onOpen={props.onOpen}
      />
    </article>
  );
}
