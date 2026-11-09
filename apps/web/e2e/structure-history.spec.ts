import { expect, test, type APIRequestContext } from '@playwright/test';

async function seed(request: APIRequestContext, name: string) {
  const { project } = await (
    await request.post('/api/projects', { data: { name, templateKey: 'mythological' } })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const { linkTypes } = await (await request.get(`${api}/link-types`)).json();
  const typeKey = (n: string) => types.find((t: { name: string }) => t.name === n).key;
  const linkKey = (l: string) => linkTypes.find((t: { label: string }) => t.label === l).key;
  const add = async (type: string, entry: string, fields = {}) =>
    (
      await (
        await request.post(`${api}/entities`, {
          data: { typeKey: typeKey(type), name: entry, fields },
        })
      ).json()
    ).key as string;
  const fact = (entityKey: string, field: string, value: unknown, start: number) =>
    request.post(`${api}/facts`, {
      data: { entityKey, field, value, storyTime: { start, end: null, precision: 'day' } },
    });
  const connect = (label: string, fromKey: string, toKey: string) =>
    request.post(`${api}/links`, { data: { typeKey: linkKey(label), fromKey, toKey } });
  return { id: project.id as string, add, fact, connect };
}

test('a work with its own structure levels, renamed later (WK-2)', async ({ page, request }) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Saga World' } })
  ).json();
  await page.goto(`/projects/${project.id}`);
  await page.getByLabel('Work name').fill('The Saga');
  await page.getByLabel('Kind').selectOption('novel');
  // Two outer levels above the novel's chapters: Book → Part → Chapter.
  await page.getByRole('button', { name: '+ Add an outer level' }).click();
  await page.getByRole('button', { name: '+ Add an outer level' }).click();
  await page.getByLabel('Level 1 name').fill('Book');
  await page.getByLabel('Level 1 plural').fill('Books');
  await page.getByLabel('Level 2 name').fill('Part');
  await page.getByLabel('Level 2 plural').fill('Parts');
  await expect(page.getByText('Book → Part → Chapter')).toBeVisible();
  await page.getByRole('button', { name: 'Create work' }).click();

  const works = page.getByRole('complementary', { name: 'Works' });
  await works.getByRole('button', { name: '+ Add book' }).click();
  await works.getByRole('button', { name: 'Actions for Book 1' }).click();
  await page.getByRole('menuitem', { name: 'Add part' }).click();
  await works.getByRole('button', { name: 'Actions for Part 1' }).click();
  await page.getByRole('menuitem', { name: 'Add chapter' }).click();
  await expect(works.getByRole('link', { name: 'Chapter 1' })).toBeVisible();

  await works.getByRole('button', { name: 'Edit the structure of The Saga' }).click();
  await expect(works.getByRole('button', { name: '+ Add an outer level' })).toHaveCount(0);
  await works.getByLabel('Level 1 name').fill('Volume');
  await works.getByLabel('Level 1 plural').fill('Volumes');
  await works.getByRole('button', { name: 'Save structure' }).click();
  await expect(works.getByRole('button', { name: '+ Add volume' })).toBeVisible();
});

test('scrap a recorded change and bring it back (CX-12)', async ({ page, request }) => {
  const { id, add, fact } = await seed(request, 'Scrap World');
  const hero = await add('Character', 'Bhishma', { status: 'alive' });
  await fact(hero, 'status', 'dead', 100);
  await page.goto(`/projects/${id}/codex?e=${hero}`);
  const changes = page.getByRole('region', { name: 'Changes over time' });
  const state = changes.getByRole('combobox', { name: /Canon state of the change to Status/ });
  await expect(state).toHaveValue('canon');
  await state.selectOption('scrapped');
  await expect(state).toHaveValue('scrapped');
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Changes over time' })
      .getByRole('combobox', { name: /Canon state of the change to Status/ }),
  ).toHaveValue('scrapped');
  await page
    .getByRole('region', { name: 'Changes over time' })
    .getByRole('combobox', { name: /Canon state/ })
    .selectOption('tentative');
  await expect(
    page.getByRole('region', { name: 'Changes over time' }).getByRole('combobox', {
      name: /Canon state/,
    }),
  ).toHaveValue('tentative');
});

test('dynasty and kingdom pages: throne holders, history, family tree, connections (CX-8, CX-9)', async ({
  page,
  request,
}) => {
  test.slow();
  const { id, add, fact, connect } = await seed(request, 'Dynasty World');
  const day = (start: number) => ({ start, end: null, precision: 'day' });
  const kuru = await add('Dynasty', 'Kuru');
  const shantanu = await add('Character', 'Shantanu', { born: day(0) });
  const bhishma = await add('Character', 'Bhishma', { born: day(50) });
  await connect('member of', shantanu, kuru);
  await connect('member of', bhishma, kuru);
  await connect('parent of', shantanu, bhishma);
  const realm = await add('Kingdom', 'Hastinapura');
  await connect('rules', shantanu, realm);
  await fact(realm, 'dynasty', kuru, 20);
  await fact(realm, 'ruler', shantanu, 20);
  await add('Event', 'The Vow', { when: day(70), participants: [bhishma] });

  await page.goto(`/projects/${id}/codex?e=${kuru}`);
  const holders = page.getByRole('region', { name: 'Throne holders over time' });
  await expect(holders).toContainText('Shantanu');
  await expect(holders).toContainText('of Hastinapura');
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByRole('listitem')).toHaveText([
    /Shantanu is born/,
    /Hastinapura: ruling dynasty becomes Kuru/,
    /Bhishma is born/,
    /The Vow/,
  ]);
  await expect(page.getByRole('group', { name: 'Family tree of Kuru' })).toBeVisible();

  await page.goto(`/projects/${id}/codex?e=${realm}`);
  await expect(page.getByRole('group', { name: 'Connections of Hastinapura' })).toBeVisible();
});
