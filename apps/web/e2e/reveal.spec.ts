import { expect, test } from '@playwright/test';

/**
 * Ties the time features together: a parentage connection revealed in Episode 2 stays hidden in
 * the family tree while Episode 1 is open, and appears once Episode 2 is (GR-1, GR-5, WK-7).
 */
test('secret parentage stays hidden until the episode that reveals it', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Reveal World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const { linkTypes } = await (await request.get(`${api}/link-types`)).json();
  const typeKey = (n: string) => types.find((t: { name: string }) => t.name === n).key;
  const linkKey = (l: string) => linkTypes.find((t: { label: string }) => t.label === l).key;
  const add = async (type: string, name: string) =>
    (
      await (
        await request.post(`${api}/entities`, { data: { typeKey: typeKey(type), name } })
      ).json()
    ).key as string;
  const father = await add('Character', 'Hidden Father');
  const son = await add('Character', 'Foundling');
  const house = await add('Dynasty', 'River House');
  for (const k of [father, son])
    await request.post(`${api}/links`, {
      data: { typeKey: linkKey('member of'), fromKey: k, toKey: house },
    });
  const { key: workKey } = await (
    await request.post(`${api}/works`, { data: { name: 'Series', medium: 'series' } })
  ).json();
  const { key: season } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: null } })
  ).json();
  const { key: ep1 } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: season } })
  ).json();
  const { key: ep2 } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: season } })
  ).json();

  // Connect them in the codex, revealed in Episode 2.
  await page.goto(`/projects/${project.id}/codex?e=${father}`);
  const detail = page.getByRole('article', { name: 'Hidden Father' });
  await detail.getByRole('button', { name: '+ Add connection' }).click();
  const form = detail.getByRole('form', { name: 'Add connection' });
  await form.getByLabel('Connection').selectOption({ label: 'parent of' });
  await form.getByLabel('Connect to').selectOption({ label: 'Foundling' });
  await form.getByLabel('Revealed in').selectOption({ label: 'Episode 2' });
  await form.getByRole('button', { name: 'Connect' }).click();
  await expect(detail.getByRole('region', { name: 'Connections' })).toContainText(
    'parent of Foundling',
  );

  const treeEdges = async (episode: string) => {
    await page.goto(`/projects/${project.id}/d/${episode}`);
    await expect(page.getByRole('textbox', { name: 'Script' })).toBeFocused();
    await page.goto(`/projects/${project.id}/graph`);
    const canvas = page.getByRole('group', { name: 'Family trees' });
    await expect(canvas.locator('.react-flow__node')).toHaveCount(2);
    return canvas.locator('.react-flow__edge');
  };
  await expect(await treeEdges(ep1)).toHaveCount(0);
  await expect(await treeEdges(ep2)).toHaveCount(1);
});
