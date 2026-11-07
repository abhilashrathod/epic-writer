'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { END_OF_TIME, type AsOf } from '@epic/core/asof';
import type { OutlineScene } from './ScriptEditor';

interface WorkspaceValue {
  projectId: string;
  /** Scenes of the open document, refreshed shortly after typing pauses. */
  scenes: OutlineScene[];
  setScenes: (s: OutlineScene[]) => void;
  /** Moves the open editor's cursor to a text offset. */
  jumpTo: (pos: number) => void;
  setJumpHandler: (fn: ((pos: number) => void) | null) => void;
  focus: boolean;
  setFocus: (on: boolean) => void;
  /**
   * The point in the story every time-aware view resolves to (GR-5). Opening an episode moves it
   * there unless `asOfPinned` (WK-7).
   */
  asOf: AsOf;
  setAsOf: (a: AsOf) => void;
  asOfPinned: boolean;
  setAsOfPinned: (on: boolean) => void;
}

const Ctx = createContext<WorkspaceValue | null>(null);

/** Shared state between the sidebar (outline) and the editor of one project. */
export function WorkspaceProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [scenes, setScenes] = useState<OutlineScene[]>([]);
  const [focus, setFocus] = useState(false);
  const [asOf, setAsOfState] = useState<AsOf>(END_OF_TIME);
  const [asOfPinned, setPinnedState] = useState(false);
  // "As of" survives reloads per project. Read after mount so server and client render alike.
  const storeKey = `epic:asOf:${projectId}`;
  const saved = useRef({ asOf: END_OF_TIME, pinned: false });
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storeKey) ?? 'null') as {
        asOf?: AsOf;
        pinned?: boolean;
      } | null;
      if (!stored) return;
      saved.current = { asOf: stored.asOf ?? END_OF_TIME, pinned: !!stored.pinned };
      setAsOfState(saved.current.asOf);
      setPinnedState(saved.current.pinned);
    } catch {
      // Storage blocked or corrupt: start at the end of story.
    }
  }, [storeKey]);
  const store = useCallback(
    (patch: Partial<{ asOf: AsOf; pinned: boolean }>) => {
      saved.current = { ...saved.current, ...patch };
      try {
        localStorage.setItem(storeKey, JSON.stringify(saved.current));
      } catch {
        // Not persisting is fine; the in-memory value still works.
      }
    },
    [storeKey],
  );
  const setAsOf = useCallback(
    (a: AsOf) => {
      setAsOfState(a);
      store({ asOf: a });
    },
    [store],
  );
  const setAsOfPinned = useCallback(
    (on: boolean) => {
      setPinnedState(on);
      store({ pinned: on });
    },
    [store],
  );
  const jump = useRef<((pos: number) => void) | null>(null);
  const jumpTo = useCallback((pos: number) => jump.current?.(pos), []);
  const setJumpHandler = useCallback((fn: ((pos: number) => void) | null) => {
    jump.current = fn;
  }, []);
  const value = useMemo(
    () => ({
      projectId,
      scenes,
      setScenes,
      jumpTo,
      setJumpHandler,
      focus,
      setFocus,
      asOf,
      setAsOf,
      asOfPinned,
      setAsOfPinned,
    }),
    [projectId, scenes, jumpTo, setJumpHandler, focus, asOf, setAsOf, asOfPinned, setAsOfPinned],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return v;
}
