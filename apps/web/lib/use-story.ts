'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SceneDto, StorylineDto } from '@epic/schemas/storylines';
import { api } from './api-client';

export const scenesKey = (projectId: string) => ['scenes', projectId] as const;
export const storylinesKey = (projectId: string) => ['storylines', projectId] as const;

/** Every scene of the project in narrative order within each work; views filter by work. */
export function useScenes(projectId: string) {
  return useQuery({
    queryKey: scenesKey(projectId),
    queryFn: () =>
      api<{ scenes: SceneDto[] }>(`/api/projects/${projectId}/scenes`).then((r) => r.scenes),
  });
}

export function useStorylines(projectId: string) {
  return useQuery({
    queryKey: storylinesKey(projectId),
    queryFn: () =>
      api<{ storylines: StorylineDto[] }>(`/api/projects/${projectId}/storylines`).then(
        (r) => r.storylines,
      ),
  });
}

/** Sets a scene's storylines or point of view, then refreshes the scene list. */
export function useTagScene(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      sceneKey: string;
      storylineKeys?: string[];
      povEntityKey?: string | null;
    }) => {
      const { sceneKey, ...body } = v;
      return api(`/api/projects/${projectId}/scenes/${sceneKey}`, { method: 'PATCH', body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scenesKey(projectId) }),
  });
}
