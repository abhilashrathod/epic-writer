import { expect, test, type APIRequestContext } from '@playwright/test';

async function seed(request: APIRequestContext) {
  const post = async (url: string, data: object) => (await request.post(url, { data })).json();
  const { project } = await post('/api/projects', {
    name: 'Storyline World',
    templateKey: 'mythological',
  });
  const api = `/api/projects/${project.id}`;
  const { key: workKey } = await post(`${api}/works`, { name: 'The Series', medium: 'series' });
  const { key: season } = await post(`${api}/documents`, { workKey, parentKey: null });
  const eps: string[] = [];
  for (let i = 0; i < 4; i++)
    eps.push((await post(`${api}/documents`, { workKey, parentKey: season })).key);
  const text = (key: string, value: string, baseVersion = 0) =>
    request.put(`${api}/documents/${key}/text`, { data: { text: value, baseVersion } });
  await text(eps[0]!, 'INT. HALL [[@s:s1]]\n\nA vow.\n\nEXT. RIVER [[@s:s2]]\n\nMist.');
  await text(eps[1]!, 'INT. COURT [[@s:s3]]');
  await text(eps[2]!, 'EXT. FOREST [[@s:s4]]');
  await text(eps[3]!, 'EXT. FIELD [[@s:s5]]');
  return { projectId: project.id as string, api, eps, text, post };
}

test('storylines: create, tag, grid going cold, thread alone, POV (GR-7)', async ({
  page,
  request,
}) => {
  test.slow(); // one long flow across two works; the dev server compiles each route on first use
  const { projectId, api, eps, text, post } = await seed(request);
  await page.goto(`/projects/${projectId}/storylines`);

  await page.getByRole('button', { name: 'New storyline' }).click();
  const form = page.getByRole('form', { name: 'New storyline' });
  await form.getByLabel('Name').fill('Karna’s thread');
  await form.getByLabel('Colour 5').check({ force: true });
  await form.getByRole('button', { name: 'Create storyline' }).click();
  const thread = page.getByRole('region', { name: 'Thread: Karna’s thread' });
  await expect(thread).toContainText('No scenes here yet.');

  // Tag a scene from the episode's scene list.
  const grid = page.getByRole('table', { name: 'Storylines by episode' });
  await grid.getByRole('button', { name: 'Episode 1' }).click();
  const episode = page.getByRole('region', { name: 'Scenes of Episode 1' });
  const toggle = episode
    .getByRole('group', { name: 'Storylines of INT. HALL' })
    .getByRole('button', { name: 'Karna’s thread' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(grid.getByRole('cell', { name: 'Karna’s thread, Episode 1: 1 scene' })).toHaveText(
    '1',
  );
  // Episodes 2–4 are written without it: the thread is going cold.
  const row = grid.getByRole('button', { name: /Karna’s thread/ });
  await expect(row).toContainText('Going cold');

  // Tags survive a save that rewrites the scene.
  await text(eps[0]!, 'INT. GREAT HALL [[@s:s1]]\n\nA vow.\n\nEXT. RIVER [[@s:s2]]', 1);
  const { scenes } = await (await request.get(`${api}/scenes`)).json();
  const s1 = scenes.find((s: { sceneKey: string }) => s.sceneKey === 's1');
  await request.patch(`${api}/scenes/s5`, { data: { storylineKeys: s1.storylineKeys } });
  await page.reload();
  await expect(row).not.toContainText('Going cold');

  // Follow the thread alone, in narrative order, linking to each scene.
  await row.click();
  await expect(thread.getByRole('listitem')).toHaveText([
    /INT\. GREAT HALL\s*Episode 1/,
    /EXT\. FIELD\s*Episode 4/,
  ]);
  await expect(thread.getByRole('link', { name: 'INT. GREAT HALL' })).toHaveAttribute(
    'href',
    `/projects/${projectId}/d/${eps[0]}?scene=s1`,
  );

  // Rename it.
  await thread.getByRole('button', { name: 'Edit storyline' }).click();
  await page.getByRole('form', { name: 'Edit Karna’s thread' }).getByLabel('Name').fill('Karna');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('region', { name: 'Thread: Karna' })).toBeVisible();

  // Point of view on a prose scene, with a storyline that runs through every work.
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const character = types.find((t: { name: string }) => t.name === 'Character').key;
  const { key: ganga } = await post(`${api}/entities`, { typeKey: character, name: 'Ganga' });
  const { key: novel } = await post(`${api}/works`, { name: 'The Novel', medium: 'novel' });
  const { key: chapter } = await post(`${api}/documents`, { workKey: novel, parentKey: null });
  await text(chapter, `# By the river <!-- s:p1 -->\n[[@e:${ganga}|Ganga]] waits.`);
  await post(`${api}/storylines`, { name: 'The river', workKey: null });
  await page.goto(`/projects/${projectId}/storylines?work=${novel}`);
  await grid.getByRole('button', { name: 'Chapter 1' }).click();
  await page.getByLabel('Point of view').selectOption({ label: 'Ganga' });
  await expect
    .poll(async () => {
      const r = await (await request.get(`${api}/scenes`)).json();
      return r.scenes.find((s: { sceneKey: string }) => s.sceneKey === 'p1').povEntityKey;
    })
    .toBe(ganga);
});
