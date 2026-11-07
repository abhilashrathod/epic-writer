import { expect, test, type APIRequestContext } from '@playwright/test';

const day = (start: number) => ({ start, end: null, precision: 'day' });

async function seed(request: APIRequestContext) {
  const post = async (url: string, data: object) => (await request.post(url, { data })).json();
  const { project } = await post('/api/projects', {
    name: 'Timeline World',
    templateKey: 'mythological',
  });
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const typeKey = (name: string) => types.find((t: { name: string }) => t.name === name).key;
  const { key: workKey } = await post(`${api}/works`, { name: 'The Series', medium: 'series' });
  const { key: season } = await post(`${api}/documents`, { workKey, parentKey: null });
  const { key: ep1 } = await post(`${api}/documents`, { workKey, parentKey: season });
  const { key: ep2 } = await post(`${api}/documents`, { workKey, parentKey: season });
  await request.patch(`${api}/documents/${ep1}`, { data: { storyTime: day(100) } });
  await request.patch(`${api}/documents/${ep2}`, { data: { storyTime: day(400) } });

  const { key: karna } = await post(`${api}/entities`, {
    typeKey: typeKey('Character'),
    name: 'Karna',
  });
  await post(`${api}/entities`, {
    typeKey: typeKey('Event'),
    name: 'The dice game',
    fields: { when: day(300) },
  });
  await post(`${api}/entities`, {
    typeKey: typeKey('Event'),
    name: 'A battle we cut',
    canonState: 'scrapped',
    fields: { when: day(200) },
  });
  await post(`${api}/facts`, {
    entityKey: karna,
    field: 'status',
    value: 'dead',
    storyTime: day(500),
  });

  const text = (key: string, value: string) =>
    request.put(`${api}/documents/${key}/text`, { data: { text: value, baseVersion: 0 } });
  await text(
    ep1,
    `INT. HALL [[@s:s1]]\n\n[[@e:${karna}|Karna]] enters.\n\nEXT. RIVER [[@s:s2]]\n\nMist.`,
  );
  await text(ep2, 'INT. COURT [[@s:s3]]\n\nDice roll.');
  return { projectId: project.id as string, ep1, karna };
}

test('timeline: narrative order and story time per work (GR-4)', async ({ page, request }) => {
  const { projectId, ep1, karna } = await seed(request);
  await page.goto(`/projects/${projectId}/timeline`);

  const panel = page.getByRole('tabpanel');
  await expect(page.getByRole('tab', { name: 'Narrative order' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel.getByRole('heading')).toHaveText(['Episode 1', 'Episode 2']);
  await expect(panel.getByRole('link', { name: /^(INT|EXT)\./ })).toHaveText([
    'INT. HALL',
    'EXT. RIVER',
    'INT. COURT',
  ]);
  await expect(panel.getByRole('link', { name: 'Karna' })).toHaveAttribute(
    'href',
    `/projects/${projectId}/codex?e=${karna}`,
  );

  await page.getByRole('tab', { name: 'Story time' }).click();
  await expect(page).toHaveURL(/view=time/);
  const items = panel.getByRole('listitem');
  await expect(items).toHaveCount(7);
  await expect(panel.getByRole('link')).toHaveText([
    'Episode 1',
    'INT. HALL', // scenes inherit their episode's story time
    'EXT. RIVER',
    'The dice game',
    'Episode 2',
    'INT. COURT',
    'Karna: Status becomes dead',
  ]);
  await expect(panel).not.toContainText('A battle we cut'); // scrapped
  await expect(items.first()).toContainText('Episode');

  await panel.getByRole('link', { name: 'INT. HALL' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${ep1}\\?scene=s1`));
});
