'use client';

import { useMemo } from 'react';
import type { NarrativeIndex } from '@epic/core/narrative-refs';
import { useWorkspace } from '../components/Workspace';
import { useScenes } from './use-story';
import { useTree } from './use-tree';

/** The project's works, episodes and scenes, for naming and resolving places in the story. */
export function useNarrativeIndex(): NarrativeIndex {
  const { projectId } = useWorkspace();
  const tree = useTree(projectId).data;
  const scenes = useScenes(projectId).data;
  return useMemo(
    () => ({
      works: tree?.works ?? [],
      documents: tree?.documents ?? [],
      scenes: scenes ?? [],
    }),
    [tree, scenes],
  );
}
