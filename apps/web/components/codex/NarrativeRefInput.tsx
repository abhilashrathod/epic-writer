'use client';

import { useState } from 'react';
import {
  describeNarrativeRef,
  labelOnlyRef,
  narrativeItems,
  needsSceneLink,
  resolveNarrativeRef,
  type NarrativeTarget,
} from '@epic/core/narrative-refs';
import type { EntityTypeDto } from '@epic/schemas/api';
import type { NarrativeRefValue } from '@epic/schemas/entity-fields';
import { Button, focusRing } from '@epic/ui';
import { useNarrativeIndex } from '../../lib/use-narrative-index';

const box = `h-10 w-full rounded-lg bg-sunk px-3 text-ink ${focusRing}`;

/** Picks places in a work: by work, episode and scene, or by typing shorthand like "S01E02". */
export function NarrativeRefInput(props: {
  field: EntityTypeDto['fields'][number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { field: f } = props;
  const index = useNarrativeIndex();
  const multiple = f.kind === 'narrativeRefList';
  const items = narrativeItems(props.value);
  const [chosenWork, setChosenWork] = useState('');
  const [typed, setTyped] = useState('');
  const [documentKey, setDocumentKey] = useState('');
  const [sceneKey, setSceneKey] = useState('');
  const [note, setNote] = useState('');

  const workKey = chosenWork || index.works[0]?.key || '';
  const work = index.works.find((w) => w.key === workKey);
  const docs = index.documents
    .filter((d) => d.workKey === workKey && d.kind === 'text')
    .sort((a, b) => a.orderPath.localeCompare(b.orderPath));
  const doc = docs.find((d) => d.key === documentKey);
  const scenes = index.scenes
    .filter((s) => s.documentKey === documentKey)
    .sort((a, b) => a.order.localeCompare(b.order));
  const leafLevel = work?.levels.find((l) => l.key === doc?.levelKey)?.singular ?? 'episode';
  const resolved = typed.trim() ? resolveNarrativeRef(typed, index, workKey) : null;

  const add = (ref: NarrativeRefValue) => {
    const item = note.trim() ? { ...ref, label: note.trim() } : ref;
    props.onChange(multiple ? [...items, item] : item);
    setTyped('');
    setDocumentKey('');
    setSceneKey('');
    setNote('');
  };
  const remove = (at: number) => {
    const rest = items.filter((_, i) => i !== at);
    props.onChange(multiple ? rest : null);
  };
  const addButton = (t: NarrativeTarget, text: string) => (
    <Button key={t.target} onClick={() => add(t.ref)}>
      {text}
    </Button>
  );
  const selected = doc && {
    workKey,
    documentKey: doc.key,
    sceneKey: sceneKey || null,
    order: scenes.find((s) => s.sceneKey === sceneKey)?.order ?? doc.orderPath,
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((r, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg bg-sunk py-1 pl-3 pr-1 text-sm"
            >
              <span className="min-w-0 flex-1">{describeNarrativeRef(r, index)}</span>
              {needsSceneLink(r) && (
                <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs">
                  Needs a scene link
                </span>
              )}
              <Button
                className="h-6 px-1"
                aria-label={`Remove ${describeNarrativeRef(r, index)} from ${f.label}`}
                onClick={() => remove(i)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
      {index.works.length > 1 && (
        <select
          aria-label={`${f.label}: work`}
          className={box}
          value={workKey}
          onChange={(e) => {
            setChosenWork(e.target.value);
            setDocumentKey('');
            setSceneKey('');
          }}
        >
          {index.works.map((w) => (
            <option key={w.key} value={w.key}>
              {w.name}
            </option>
          ))}
        </select>
      )}
      <input
        aria-label={`${f.label}: type a place`}
        className={box}
        placeholder="Type S01E02, Book 1 ch 4 or a title"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {resolved?.status === 'resolved' && (
        <p className="flex items-center justify-between gap-2 text-sm">
          <span>Goes to {resolved.target}</span>
          {addButton(resolved, 'Add this place')}
        </p>
      )}
      {resolved?.status === 'ambiguous' && (
        <div className="flex flex-col items-start gap-1 text-sm">
          <span>That fits several places. Choose one:</span>
          {resolved.options.map((o) => addButton(o, o.target))}
        </div>
      )}
      {resolved?.status === 'unresolved' && (
        <p className="flex items-center justify-between gap-2 text-sm">
          <span>No place matches that yet.</span>
          <Button onClick={() => add(labelOnlyRef(typed.trim()))}>Keep as a label</Button>
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          aria-label={`${f.label}: episode or chapter`}
          className={box}
          value={documentKey}
          onChange={(e) => {
            setDocumentKey(e.target.value);
            setSceneKey('');
          }}
        >
          <option value="">Choose an episode or chapter…</option>
          {docs.map((d) => (
            <option key={d.key} value={d.key}>
              {describeNarrativeRef(
                { workKey, documentKey: d.key, sceneKey: null, order: d.orderPath },
                { ...index, works: work ? [work] : [] },
              )}
            </option>
          ))}
        </select>
        <select
          aria-label={`${f.label}: scene`}
          className={box}
          value={sceneKey}
          disabled={!doc}
          onChange={(e) => setSceneKey(e.target.value)}
        >
          <option value="">Whole {leafLevel.toLowerCase()}</option>
          {scenes.map((s, i) => (
            <option key={s.sceneKey} value={s.sceneKey}>
              {i + 1}. {s.heading}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input
          aria-label={`${f.label}: label`}
          className={box}
          placeholder="Label (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {selected && <Button onClick={() => add(selected)}>Add</Button>}
      </div>
    </div>
  );
}
