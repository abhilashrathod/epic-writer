import type { APIRequestContext } from '@playwright/test';

/** Creates a project with a series, Season 1 and Episode 1 through the API; returns the editor URL. */
export async function createEpisode(
  request: APIRequestContext,
  name = 'Editor World',
): Promise<string> {
  const { project } = await (await request.post('/api/projects', { data: { name } })).json();
  const base = `/api/projects/${project.id}`;
  const { key: workKey } = await (
    await request.post(`${base}/works`, { data: { name: 'The Series', medium: 'series' } })
  ).json();
  const { key: season } = await (
    await request.post(`${base}/documents`, { data: { workKey, parentKey: null } })
  ).json();
  const { key: episode } = await (
    await request.post(`${base}/documents`, { data: { workKey, parentKey: season } })
  ).json();
  return `/projects/${project.id}/d/${episode}`;
}
