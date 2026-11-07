'use client';

import { useState } from 'react';
import { Button, Icon, TYPE_TEXT, focusRing } from '@epic/ui';
import { useLinkTypes, useTypes } from '../lib/use-types';
import { ConnectionTypeForm } from './ConnectionTypeForm';
import { TypeForm } from './TypeForm';
import { useWorkspace } from './Workspace';

/** Create, edit and delete entry types (CX-1, CX-2, CX-4, CX-11). */
export function TypesEditor() {
  const { projectId } = useWorkspace();
  const types = useTypes(projectId);
  const linkTypes = useLinkTypes(projectId);
  const [selected, setSelected] = useState<string | 'new' | 'newLink' | null>(null);

  if (types.isPending) return <p className="p-8 text-muted">Loading entry types…</p>;
  if (types.error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load entry types: {types.error.message}
      </p>
    );
  const { groups, types: list } = types.data;
  const current = selected === 'new' ? null : (list.find((t) => t.key === selected) ?? null);

  return (
    <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start">
      <nav aria-label="Entry types" className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Entry types</h1>
          <Button onClick={() => setSelected('new')}>+ New type</Button>
        </div>
        {list.length === 0 && (
          <p className="text-sm text-muted">
            No entry types yet. Add one for each kind of thing in your world: characters, places,
            weapons.
          </p>
        )}
        {groups.map((g) => {
          const inGroup = list.filter((t) => t.group === g.key);
          if (!inGroup.length) return null;
          return (
            <section key={g.key} aria-label={g.name} className="flex flex-col gap-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-faint">{g.name}</p>
              {inGroup.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSelected(t.key)}
                  aria-current={selected === t.key ? 'true' : undefined}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${focusRing} ${selected === t.key ? 'bg-selected text-on-selected' : 'hover:bg-sunk'}`}
                >
                  <Icon name={t.icon} className={selected === t.key ? '' : TYPE_TEXT[t.color]} />
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto text-xs opacity-60">{t.fields.length}</span>
                </button>
              ))}
            </section>
          );
        })}
        <section aria-label="Connection types" className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Connections</p>
            <Button className="h-7" onClick={() => setSelected('newLink')}>
              + New
            </Button>
          </div>
          {linkTypes.data?.length === 0 && <p className="text-sm text-muted">None yet.</p>}
          <ul className="flex flex-col text-sm">
            {linkTypes.data?.map((l) => (
              <li key={l.key} className="px-2 py-1">
                {l.label}
                {!l.symmetric && <span className="text-muted"> / {l.inverseLabel}</span>}
              </li>
            ))}
          </ul>
        </section>
      </nav>
      <div className="min-w-0 flex-1">
        {selected === 'newLink' ? (
          <ConnectionTypeForm types={list} onDone={() => setSelected(null)} />
        ) : selected === null ? (
          <p className="text-muted">Pick a type to edit it, or add a new one.</p>
        ) : (
          <TypeForm
            key={selected}
            existing={current}
            groups={groups}
            types={list}
            onDone={(key) => setSelected(key)}
          />
        )}
      </div>
    </div>
  );
}
