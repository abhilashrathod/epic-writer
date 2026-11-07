'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DocumentDto, WorkDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { useTree, useTreeMutation } from '../lib/use-tree';
import { NewWorkForm } from './NewWorkForm';
import { useWorkspace } from './Workspace';

const menuItem =
  'flex cursor-default rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-sunk';

export function WorksTree({ onNavigate }: { onNavigate: () => void }) {
  const { projectId } = useWorkspace();
  const tree = useTree(projectId);
  const [adding, setAdding] = useState(false);

  if (tree.isPending) return <p className="text-sm text-muted">Loading works…</p>;
  if (tree.error)
    return (
      <p role="alert" className="text-sm text-bad">
        Couldn’t load works: {tree.error.message}
      </p>
    );

  return (
    <div className="flex flex-col gap-5">
      {tree.data.works.map((w) => (
        <WorkNode
          key={w.key}
          work={w}
          documents={tree.data.documents.filter((d) => d.workKey === w.key)}
          onNavigate={onNavigate}
        />
      ))}
      {adding ? (
        <NewWorkForm onDone={() => setAdding(false)} />
      ) : (
        <Button className="self-start" onClick={() => setAdding(true)}>
          + New work
        </Button>
      )}
    </div>
  );
}

function WorkNode({
  work,
  documents,
  onNavigate,
}: {
  work: WorkDto;
  documents: DocumentDto[];
  onNavigate: () => void;
}) {
  const { projectId } = useWorkspace();
  const add = useTreeMutation(projectId, (parentKey: string | null) =>
    api(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      body: { workKey: work.key, parentKey },
    }),
  );
  const top = work.levels[0];
  return (
    <section className="flex flex-col gap-1" aria-label={work.name}>
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{work.name}</p>
      <ul className="flex flex-col">
        {documents
          .filter((d) => d.parentKey === null)
          .map((d) => (
            <DocNode
              key={d.key}
              doc={d}
              work={work}
              all={documents}
              onAdd={(k) => add.mutate(k)}
              onNavigate={onNavigate}
            />
          ))}
      </ul>
      {top && (
        <Button className="self-start" onClick={() => add.mutate(null)} disabled={add.isPending}>
          + Add {top.singular.toLowerCase()}
        </Button>
      )}
      {add.error && (
        <p role="alert" className="text-sm text-bad">
          {add.error.message}
        </p>
      )}
    </section>
  );
}

function DocNode(props: {
  doc: DocumentDto;
  work: WorkDto;
  all: DocumentDto[];
  onAdd: (parentKey: string) => void;
  onNavigate: () => void;
}) {
  const { doc, work, all } = props;
  const { projectId, scenes, jumpTo } = useWorkspace();
  const params = useParams<{ documentKey?: string }>();
  const [mode, setMode] = useState<'view' | 'rename' | 'confirmDelete'>('view');
  const [title, setTitle] = useState(doc.title);
  const url = `/api/projects/${projectId}/documents/${doc.key}`;
  const patch = useTreeMutation(projectId, (body: object) => api(url, { method: 'PATCH', body }));
  const remove = useTreeMutation(projectId, () => api(url, { method: 'DELETE' }));

  const open = params.documentKey === doc.key;
  const children = all.filter((d) => d.parentKey === doc.key);
  const childLevel = work.levels[work.levels.findIndex((l) => l.key === doc.levelKey) + 1];

  function rename(e: FormEvent) {
    e.preventDefault();
    patch.mutate({ title }, { onSuccess: () => setMode('view') });
  }

  return (
    <li className="flex flex-col">
      {mode === 'rename' ? (
        <form onSubmit={rename} className="flex gap-1 py-0.5">
          <input
            aria-label={`New title for ${doc.title}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setMode('view')}
            autoFocus
            className={`h-8 min-w-0 flex-1 rounded-md bg-sunk px-2 text-sm ${focusRing}`}
          />
          <Button type="submit" className="h-8">
            Save
          </Button>
        </form>
      ) : (
        <div
          className={`group flex items-center rounded-md ${open ? 'bg-selected text-on-selected' : ''}`}
        >
          {doc.kind === 'text' ? (
            <Link
              href={`/projects/${projectId}/d/${doc.key}`}
              onClick={props.onNavigate}
              aria-current={open ? 'page' : undefined}
              className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm ${focusRing}`}
            >
              {doc.title}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm font-medium">
              {doc.title}
            </span>
          )}
          <Menu.Root>
            <Menu.Trigger asChild>
              <button
                aria-label={`Actions for ${doc.title}`}
                className={`rounded-md px-2 text-muted opacity-60 group-hover:opacity-100 focus-visible:opacity-100 ${focusRing}`}
              >
                ⋯
              </button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content
                align="end"
                className="min-w-40 rounded-xl bg-panel p-1.5 text-ink shadow-lg"
              >
                {childLevel && (
                  <Menu.Item className={menuItem} onSelect={() => props.onAdd(doc.key)}>
                    Add {childLevel.singular.toLowerCase()}
                  </Menu.Item>
                )}
                <Menu.Item className={menuItem} onSelect={() => setMode('rename')}>
                  Rename
                </Menu.Item>
                <Menu.Item className={menuItem} onSelect={() => patch.mutate({ move: 'up' })}>
                  Move up
                </Menu.Item>
                <Menu.Item className={menuItem} onSelect={() => patch.mutate({ move: 'down' })}>
                  Move down
                </Menu.Item>
                <Menu.Item
                  className={`${menuItem} text-bad`}
                  onSelect={() => setMode('confirmDelete')}
                >
                  Delete…
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}

      {mode === 'confirmDelete' && (
        <div role="alert" className="my-1 flex flex-col gap-2 rounded-lg bg-bad-soft p-2 text-sm">
          <span>
            Delete “{doc.title}”{children.length ? ' and everything in it' : ''}?
          </span>
          <div className="flex gap-2">
            <button
              className={`rounded-md bg-bad px-2 py-1 font-medium text-surface ${focusRing}`}
              onClick={() => remove.mutate()}
            >
              Delete {doc.title}
            </button>
            <Button onClick={() => setMode('view')} className="h-7">
              Cancel
            </Button>
          </div>
        </div>
      )}
      {(patch.error ?? remove.error) && (
        <p role="alert" className="text-sm text-bad">
          {(patch.error ?? remove.error)?.message}
        </p>
      )}

      {open && scenes.length > 0 && (
        <ol className="ml-3 flex flex-col py-1" aria-label="Scenes">
          {scenes.map((s, i) => (
            <li key={`${s.from}-${i}`}>
              <button
                onClick={() => jumpTo(s.from)}
                className={`w-full truncate rounded-md px-2 py-1 text-left text-xs text-muted hover:text-ink ${focusRing}`}
              >
                {s.heading || 'Untitled scene'}
              </button>
            </li>
          ))}
        </ol>
      )}

      {children.length > 0 && (
        <ul className="ml-3 flex flex-col">
          {children.map((c) => (
            <DocNode key={c.key} {...props} doc={c} />
          ))}
        </ul>
      )}
    </li>
  );
}
