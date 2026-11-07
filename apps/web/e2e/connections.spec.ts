import { expect, test } from '@playwright/test';

test('connections read from both sides; dynasties, kingdoms and appearances (CX-7, CX-8, CX-9)', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Links World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const typeKey = (n: string) => types.find((t: { name: string }) => t.name === n).key;
  const add = async (type: string, name: string, fields = {}) =>
    (
      await (
        await request.post(`${api}/entities`, { data: { typeKey: typeKey(type), name, fields } })
      ).json()
    ).key as string;
  await add('Character', 'Shantanu');
  const son = await add('Character', 'Bhishma');
  const house = await add('Dynasty', 'Kuru');
  const realm = await add('Kingdom', 'Northern Realm');
  await add('Event', 'The Siege', { where: realm });

  // A scene that mentions the son, for Appearances.
  const { key: workKey } = await (
    await request.post(`${api}/works`, { data: { name: 'Film', medium: 'film' } })
  ).json();
  const { key: doc } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: null, title: 'Draft' } })
  ).json();
  const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}.`).join('\n\n');
  await request.put(`${api}/documents/${doc}/text`, {
    data: {
      text: `INT. GATE [[@s:s1]]\n\n${filler}\n\nEXT. RIVER - DAWN [[@s:s2]]\n\n[[@e:${son}|Bhishma]] waits.`,
      baseVersion: 0,
    },
  });

  await page.goto(`/projects/${project.id}/codex?e=${son}`);
  const detail = page.getByRole('article', { name: 'Bhishma' });
  await detail.getByRole('button', { name: '+ Add connection' }).click();
  const form = detail.getByRole('form', { name: 'Add connection' });
  await form.getByLabel('Connection').selectOption({ label: 'child of' });
  await form.getByLabel('Connect to').selectOption({ label: 'Shantanu' });
  await form.getByRole('button', { name: 'Connect' }).click();
  const connections = detail.getByRole('region', { name: 'Connections' });
  await expect(connections).toContainText('Family');
  await expect(connections).toContainText('child of Shantanu');

  await detail.getByRole('button', { name: '+ Add connection' }).click();
  await form.getByLabel('Connection').selectOption({ label: 'member of' });
  await form.getByLabel('Connect to').selectOption({ label: 'Kuru' });
  await form.getByLabel('Note').fill('by birth');
  await form.getByRole('button', { name: 'Connect' }).click();
  await expect(connections).toContainText('member of Kuru · by birth');

  // The other side reads the inverse.
  await connections.getByRole('button', { name: 'Shantanu', exact: true }).click();
  await expect(
    page.getByRole('article', { name: 'Shantanu' }).getByRole('region', { name: 'Connections' }),
  ).toContainText('parent of Bhishma');
  await page.goto(`/projects/${project.id}/codex?e=${house}`);
  await expect(
    page.getByRole('article', { name: 'Kuru' }).getByRole('region', { name: 'Connections' }),
  ).toContainText('has member Bhishma');

  // Kingdom page: the event that happened there.
  await page.goto(`/projects/${project.id}/codex?e=${realm}`);
  await expect(
    page
      .getByRole('article', { name: 'Northern Realm' })
      .getByRole('region', { name: 'Referenced by' }),
  ).toContainText('The Siege · Where');

  // Appearances link to the scene, and the editor jumps there.
  await page.goto(`/projects/${project.id}/codex?e=${son}`);
  await detail
    .getByRole('region', { name: 'Appearances' })
    .getByRole('link', { name: /EXT\. RIVER - DAWN/ })
    .click();
  await expect(page.getByRole('textbox', { name: 'Script' })).toBeFocused();
  await expect(
    page.locator('.cm-fountain-sceneHeading', { hasText: 'EXT. RIVER - DAWN' }),
  ).toBeInViewport();
});

test('a blank project can define its own connection type', async ({ page, request }) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Blank Links', templateKey: 'blank' } })
  ).json();
  await request.post(`/api/projects/${project.id}/entity-types`, {
    data: { name: 'Creature', pluralName: 'Creatures', group: 'land' },
  });
  await page.goto(`/projects/${project.id}/codex/types`);
  const conn = page.getByRole('region', { name: 'Connection types' });
  await expect(conn).toContainText('None yet.');
  await conn.getByRole('button', { name: '+ New' }).click();
  const form = page.getByRole('form', { name: 'New connection type' });
  await form.getByLabel('Reads as', { exact: true }).fill('hunts');
  await form.getByLabel('Reverse reads as').fill('hunted by');
  await form.getByLabel('Kind').selectOption('relation');
  await form.getByRole('button', { name: 'Create connection type' }).click();
  await expect(conn).toContainText('hunts / hunted by');
});
