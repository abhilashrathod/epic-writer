'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { DocumentTextDto } from '@epic/schemas/api';
import { Button } from '@epic/ui';
import { api } from '../lib/api-client';
import { ScriptEditor } from './ScriptEditor';
import { useWorkspace } from './Workspace';

export function DocumentEditor({ documentKey }: { documentKey: string }) {
  const { projectId, setScenes, setJumpHandler, focus, setFocus, scenes, jumpTo } = useWorkspace();
  const doc = useQuery({
    queryKey: ['text', projectId, documentKey],
    queryFn: () => api<DocumentTextDto>(`/api/projects/${projectId}/documents/${documentKey}/text`),
    // The editor owns the text once loaded; refetching would fight the writer.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [typing, setTyping] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const typingRef = useRef(false);

  // Focus mode: Esc exits, and controls fade while typing and return when the mouse moves.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false);
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

  useEffect(() => () => setScenes([]), [documentKey, setScenes]);

  if (doc.isPending) return <p className="p-8 text-muted">Opening…</p>;
  if (doc.error)
    return (
      <p role="alert" className="m-8 rounded-lg bg-bad-soft p-3 text-bad">
        Couldn’t open this document: {doc.error.message}
      </p>
    );

  const { document, text } = doc.data;
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
          <h1 className="truncate text-lg font-semibold tracking-tight">{document.title}</h1>
        )}
        <div className="flex gap-1">
          {focus && (
            <Button onClick={() => setShowScenes((s) => !s)} aria-expanded={showScenes}>
              Scenes
            </Button>
          )}
          <Button onClick={() => setFocus(!focus)}>{focus ? 'Exit focus (Esc)' : 'Focus'}</Button>
        </div>
      </header>

      {focus && showScenes && (
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

      <div
        className={`mx-auto w-full ${focus ? 'max-w-[calc(60ch+8rem)] py-24' : 'max-w-[calc(60ch+8rem)] px-4 pb-24'}`}
      >
        <div className="rounded-xl bg-surface px-8 py-12 sm:px-16">
          <ScriptEditor
            key={documentKey}
            initialText={text}
            format={document.format}
            onScenes={setScenes}
            onJumpHandler={setJumpHandler}
            onTyping={onTyping}
          />
        </div>
      </div>
    </div>
  );
}
