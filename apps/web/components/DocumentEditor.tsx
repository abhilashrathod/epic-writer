'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { mentionMarker } from '@epic/fountain';
import type { MentionCandidate } from '@epic/fountain/mentions';
import type { DocumentTextDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { AskCodex } from './AskCodex';
import { useContinuity } from '../lib/use-continuity';
import { useDocumentSync, type SaveStatus } from '../lib/use-document-sync';
import { useEntities, useTypes } from '../lib/use-types';
import { EntryForm } from './codex/EntryForm';
import { ExtractPanel } from './ExtractPanel';
import { ContinuityPanel } from './ContinuityPanel';
import { HistoryPanel } from './HistoryPanel';
import { MentionCard } from './MentionCard';
import { ScriptEditor, type EditorHandle, type TextSelection } from './ScriptEditor';
import { useWorkspace } from './Workspace';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline. Your text is kept on this device and will save when you reconnect.',
  conflict: 'Changed on another device',
};

type FocusPanel = 'scenes' | 'ask' | 'check' | 'history' | 'extract';
const FOCUS_BUTTONS: [FocusPanel, string][] = [
  ['scenes', 'Scenes'],
  ['ask', 'Ask'],
  ['check', 'Check'],
  ['history', 'History'],
];
const menuItem =
  'flex cursor-default rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-sunk';
export function DocumentEditor({
  documentKey,
  sceneKey,
}: {
  documentKey: string;
  sceneKey?: string;
}) {
  const { projectId } = useWorkspace();
  const doc = useQuery({
    queryKey: ['text', projectId, documentKey],
    queryFn: () => api<DocumentTextDto>(`/api/projects/${projectId}/documents/${documentKey}/text`),
    // Fetch fresh on every open (another device may have saved), never refetch while editing:
    // from here on the editor owns the text.
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (doc.isPending) return <p className="p-8 text-muted">Opening…</p>;
  if (doc.error)
    return (
      <p role="alert" className="m-8 rounded-lg bg-bad-soft p-3 text-bad">
        Couldn’t open this document: {doc.error.message}
      </p>
    );
  return <LoadedDocument key={documentKey} data={doc.data} sceneKey={sceneKey} />;
}

function LoadedDocument({ data, sceneKey }: { data: DocumentTextDto; sceneKey?: string }) {
  const { projectId, setScenes, setJumpHandler, focus, setFocus, scenes, jumpTo } = useWorkspace();
  const { asOfPinned, setAsOf } = useWorkspace();
  const { document, text } = data;
  // WK-7: opening an episode moves "as of" to its point in the story, unless pinned.
  const docStart = document.storyTime?.start ?? null;
  useEffect(() => {
    if (!asOfPinned)
      setAsOf({
        storyTime: docStart,
        workKey: document.workKey,
        order: `${document.orderPath}.9999`,
      });
  }, [asOfPinned, setAsOf, docStart, document.workKey, document.orderPath]);
  const base = `/api/projects/${projectId}/documents/${document.key}`;
  const sync = useDocumentSync({
    projectId,
    documentKey: document.key,
    format: document.format,
    initial: { text, version: data.version },
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const meta = useTypes(projectId);
  const entities = useEntities(projectId);
  const editor = useRef<EditorHandle | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [adding, setAdding] = useState<TextSelection | null>(null);
  const [card, setCard] = useState<{ key: string; rect: DOMRect } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const continuity = useContinuity({
    projectId,
    documentKey: document.key,
    editor,
    save: sync.save,
    saved: sync.status === 'saved',
  });
  const openIssues = continuity.issues.filter((i) => i.status === 'open').length;

  // Read by autocomplete when it opens; a ref keeps the editor from being rebuilt as entries change.
  const candidates = useRef<MentionCandidate[]>([]);
  const types = meta.data?.types ?? [];
  candidates.current = (entities.data ?? [])
    .filter((e) => e.canonState !== 'scrapped')
    .map((e) => {
      const t = types.find((x) => x.key === e.typeKey);
      return {
        key: e.key,
        name: e.name,
        aliases: e.aliases,
        typeName: t?.name ?? '',
        speaker: !!t?.traits.includes('born'),
      };
    });
  // "Add to codex" works on a short, single-line selection: a name, not a paragraph.
  const nameSelection =
    selection &&
    selection.text.trim() &&
    selection.text.length <= 120 &&
    !selection.text.includes('\n')
      ? selection
      : null;
  const cardEntry = card ? entities.data?.find((e) => e.key === card.key) : undefined;
  const [typing, setTyping] = useState(false);
  // Focus mode shows one drawer at a time over the page (ED-11).
  const [focusPanel, setFocusPanel] = useState<FocusPanel | null>(null);
  const toggleFocusPanel = (p: FocusPanel) => setFocusPanel((x) => (x === p ? null : p));
  const typingRef = useRef(false);

  // Focus mode: Esc closes the open drawer, then exits; controls fade while typing and return
  // when the mouse moves.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setFocusPanel((p) => {
        if (!p) setFocus(false);
        return null;
      });
    };
    const onMove = () => {
      if (typingRef.current) {
        typingRef.current = false;
        setTyping(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
    };
  }, [focus, setFocus]);

  useEffect(() => () => setScenes([]), [setScenes]);

  const onTyping = () => {
    if (focus && !typingRef.current) {
      typingRef.current = true;
      setTyping(true);
    }
  };

  return (
    <div className={focus ? 'fixed inset-0 z-40 overflow-y-auto bg-bg' : 'flex flex-col'}>
      <header
        className={
          focus
            ? `fixed inset-x-0 top-0 z-50 flex justify-end gap-1 p-3 transition-opacity motion-reduce:transition-none ${typing ? 'opacity-0' : 'opacity-60 hover:opacity-100 focus-within:opacity-100'}`
            : 'flex items-center justify-between gap-4 px-6 py-4'
        }
      >
        {!focus && (
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight">{document.title}</h1>
            <span
              role="status"
              aria-live="polite"
              className={`truncate text-sm ${sync.status === 'offline' || sync.status === 'conflict' ? 'text-warn' : 'text-faint'}`}
            >
              {STATUS_TEXT[sync.status]}
            </span>
          </div>
        )}
        <div className="flex gap-1">
          {!focus && nameSelection && (
            <Button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAdding(nameSelection);
                setShowHistory(false);
              }}
            >
              Add to codex
            </Button>
          )}
          {!focus && (
            <Button onClick={() => setShowExtract((x) => !x)} aria-expanded={showExtract}>
              Extract
            </Button>
          )}
          {!focus && (
            <Button onClick={() => setShowIssues((v) => !v)} aria-expanded={showIssues}>
              Continuity{openIssues > 0 && ` (${openIssues})`}
            </Button>
          )}
          {!focus && (
            <Button
              onClick={() => {
                setShowHistory((h) => !h);
                setAdding(null);
              }}
              aria-expanded={showHistory}
            >
              History
            </Button>
          )}
          {!focus && (
            <a
              href={`${base}/download`}
              download
              className={`inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-muted hover:text-ink ${focusRing}`}
            >
              Download .{document.format === 'fountain' ? 'fountain' : 'md'}
            </a>
          )}
          {focus &&
            FOCUS_BUTTONS.map(([p, label]) => (
              <Button key={p} onClick={() => toggleFocusPanel(p)} aria-expanded={focusPanel === p}>
                {p === 'check' && openIssues > 0 ? `${label} (${openIssues})` : label}
              </Button>
            ))}
          {focus && (
            <Menu.Root>
              <Menu.Trigger asChild>
                <Button aria-label="More">More</Button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content
                  align="end"
                  className="z-50 min-w-40 rounded-xl bg-panel p-1.5 text-ink shadow-lg"
                >
                  <Menu.Item className={menuItem} onSelect={() => setFocusPanel('extract')}>
                    Extract
                  </Menu.Item>
                  <Menu.Item asChild className={menuItem}>
                    <a href={`${base}/download`} download>
                      Download .{document.format === 'fountain' ? 'fountain' : 'md'}
                    </a>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          )}
          <Button onClick={() => setFocus(!focus)}>{focus ? 'Exit focus (Esc)' : 'Focus'}</Button>
        </div>
      </header>

      {focus && focusPanel && focusPanel !== 'scenes' && (
        <div className="fixed right-3 top-14 z-50 max-h-[80vh] w-[28rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl bg-panel shadow-lg">
          {focusPanel === 'ask' && <AskCodex />}
          {focusPanel === 'check' && (
            <ContinuityPanel
              projectId={projectId}
              continuity={continuity}
              entries={entities.data ?? []}
              onJump={jumpTo}
              onClose={() => setFocusPanel(null)}
            />
          )}
          {focusPanel === 'history' && (
            <HistoryPanel
              base={base}
              prepareRestore={async () => ((await sync.save()) ? sync.baseVersion() : null)}
              onRestored={sync.applyRestored}
              onClose={() => setFocusPanel(null)}
            />
          )}
          {focusPanel === 'extract' && (
            <ExtractPanel
              documentKey={document.key}
              save={sync.save}
              onClose={() => setFocusPanel(null)}
            />
          )}
        </div>
      )}

      {focus && focusPanel === 'scenes' && (
        <nav
          aria-label="Scenes"
          className="fixed right-3 top-14 z-50 max-h-[70vh] w-64 overflow-y-auto rounded-xl bg-panel p-2 shadow-lg"
        >
          {scenes.length === 0 && <p className="p-2 text-sm text-muted">No scenes yet.</p>}
          {scenes.map((s, i) => (
            <button
              key={`${s.from}-${i}`}
              onClick={() => jumpTo(s.from)}
              className="block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-sunk"
            >
              {s.heading || 'Untitled scene'}
            </button>
          ))}
        </nav>
      )}

      {sync.conflict && (
        <div
          role="alert"
          className="mx-auto mb-4 flex w-full max-w-[calc(60ch+8rem)] flex-col gap-2 rounded-xl bg-warn-soft p-4"
        >
          <p>
            <strong>“{document.title}” changed on another device</strong> since you opened it. Pick
            which text to keep; the other is saved in history.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void sync.keepMine()}>
              Keep my version
            </Button>
            <Button onClick={() => void sync.takeTheirs()}>Use the other version</Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 px-4 pb-24 md:flex-row md:items-start">
        <div className={`mx-auto w-full max-w-[calc(60ch+8rem)] ${focus ? 'py-24' : ''}`}>
          <div className="rounded-xl bg-surface px-8 py-12 sm:px-16">
            <ScriptEditor
              initialText={text}
              format={document.format}
              onScenes={setScenes}
              onJumpHandler={setJumpHandler}
              onTyping={onTyping}
              onChange={sync.onChange}
              onReady={(h) => {
                editor.current = h;
                sync.onReady(h);
              }}
              getCandidates={() => candidates.current}
              onMentionClick={(key, rect) => setCard({ key, rect })}
              onSelection={setSelection}
              initialSceneKey={sceneKey}
            />
          </div>
        </div>
        {adding && !focus && meta.data && (
          <aside
            aria-label="Add to codex"
            className="w-full shrink-0 rounded-xl bg-panel p-4 md:w-96"
          >
            <EntryForm
              projectId={projectId}
              meta={meta.data}
              entries={entities.data ?? []}
              existing={null}
              initialName={adding.text.trim()}
              onDone={(key) => {
                // Turn the selected words into a mention of the new entry, keeping the words as written.
                if (key)
                  editor.current?.replaceRange(
                    adding.from,
                    adding.to,
                    mentionMarker(key, adding.text.trim()),
                  );
                setAdding(null);
              }}
            />
          </aside>
        )}
        {showExtract && !focus && (
          <ExtractPanel
            documentKey={document.key}
            save={sync.save}
            onClose={() => setShowExtract(false)}
          />
        )}
        {showIssues && !focus && (
          <ContinuityPanel
            projectId={projectId}
            continuity={continuity}
            entries={entities.data ?? []}
            onJump={jumpTo}
            onClose={() => setShowIssues(false)}
          />
        )}
        {showHistory && !focus && (
          <HistoryPanel
            base={base}
            prepareRestore={async () => ((await sync.save()) ? sync.baseVersion() : null)}
            onRestored={sync.applyRestored}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
      {card && (
        <MentionCard
          projectId={projectId}
          entry={cardEntry}
          type={types.find((t) => t.key === cardEntry?.typeKey)}
          rect={card.rect}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}
