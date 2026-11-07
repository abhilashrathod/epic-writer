'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SceneSpan } from '@epic/fountain';

interface WorkspaceValue {
  projectId: string;
  /** Scenes of the open document, refreshed shortly after typing pauses. */
  scenes: SceneSpan[];
  setScenes: (s: SceneSpan[]) => void;
  /** Moves the open editor's cursor to a text offset. */
  jumpTo: (pos: number) => void;
  setJumpHandler: (fn: ((pos: number) => void) | null) => void;
  focus: boolean;
  setFocus: (on: boolean) => void;
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
  const [scenes, setScenes] = useState<SceneSpan[]>([]);
  const [focus, setFocus] = useState(false);
  const jump = useRef<((pos: number) => void) | null>(null);
  const jumpTo = useCallback((pos: number) => jump.current?.(pos), []);
  const setJumpHandler = useCallback((fn: ((pos: number) => void) | null) => {
    jump.current = fn;
  }, []);
  const value = useMemo(
    () => ({ projectId, scenes, setScenes, jumpTo, setJumpHandler, focus, setFocus }),
    [projectId, scenes, jumpTo, setJumpHandler, focus],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return v;
}
