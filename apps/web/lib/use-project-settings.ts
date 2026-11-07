'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectSettingsDto, UploadedImageDto } from '@epic/schemas/api';
import { api } from './api-client';

export const settingsKey = (projectId: string) => ['projectSettings', projectId] as const;

export function useProjectSettings(projectId: string) {
  return useQuery({
    queryKey: settingsKey(projectId),
    queryFn: () => api<ProjectSettingsDto>(`/api/projects/${projectId}/settings`),
  });
}

/** One PATCH of project settings (body is one section, see updateProjectBody); refetches after. */
export function useSaveSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      api(`/api/projects/${projectId}/settings`, { method: 'PATCH', body }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: settingsKey(projectId) }),
        // Units and the default calendar also reach entry forms and dates.
        qc.invalidateQueries({ queryKey: ['types', projectId] }),
        qc.invalidateQueries({ queryKey: ['projects'] }),
      ]),
  });
}

async function dimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

/** Uploads an image straight to storage through a signed URL, then records it as an asset. */
export async function uploadImage(projectId: string, file: File): Promise<UploadedImageDto> {
  const base = `/api/projects/${projectId}/assets`;
  const { storageKey, uploadUrl } = await api<{ storageKey: string; uploadUrl: string }>(
    `${base}/uploads`,
    { method: 'POST', body: { mime: file.type, size: file.size } },
  );
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type },
    });
  } catch {
    throw new Error('The upload was blocked. Check the bucket’s CORS rule (pnpm r2:cors).');
  }
  if (!res.ok) throw new Error(`The upload failed (${res.status}). Try again.`);
  return api<UploadedImageDto>(base, {
    method: 'POST',
    body: { storageKey, ...(await dimensions(file)) },
  });
}
