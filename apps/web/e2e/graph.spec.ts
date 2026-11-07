import { expect, test } from '@playwright/test';

const SHOTS = process.env.GRAPH_SHOTS;

test('family tree, relationship web and lineage (GR-1, GR-2, GR-3)', async ({ page, request }) => {
  test.slow();
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Graph World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const { linkTypes } = await (await request.get(`${api}/link-types`)).json();
  const typeKey = (n: string) => types.find((t: { name: string }) => t.name === n).key;
  const linkKey = (l: string) => linkTypes.find((t: { label: string }) => t.label === l).key;
  const add = async (type: string, name: string, fields = {}) =>
    (
      await (
        await request.post(`${api}/entities`, { data: { typeKey: typeKey(type), name, fields } })
      ).json()
    ).key as string;
  const connect = (label: string, fromKey: string, toKey: string) =>
    request.post(`${api}/links`, { data: { typeKey: linkKey(label), fromKey, toKey } });

  const day = (start: number) => ({ start, end: null, precision: 'day' });
  const shantanu = await add('Character', 'Shantanu', { born: day(0), died: day(900) });
  const ganga = await add('Character', 'Ganga');
  const bhishma = await add('Character', 'Bhishma', { born: day(100) });
  const drona = await add('Character', 'Drona');
  const arjuna = await add('Character', 'Arjuna');
  const kuru = await add('Dynasty', 'Kuru');
  await connect('parent of', shantanu, bhishma);
  await connect('spouse of', shantanu, ganga);
  await connect('member of', shantanu, kuru);
  await connect('member of', bhishma, kuru);
  await connect('teacher of', drona, arjuna);
  await connect('ally of', bhishma, drona);

  // GR-1: the Kuru tree shows its members and their family links; the dead are marked.
  await page.goto(`/projects/${project.id}/graph`);
  const tabs = page.getByRole('tablist', { name: 'Graph views' });
  await expect(tabs.getByRole('tab', { name: 'Family trees' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Tree' })).toHaveValue(kuru);
  const canvas = page.getByRole('group', { name: 'Family trees' });
  await expect(canvas.locator('.react-flow__node')).toHaveCount(2);
  await expect(canvas.getByRole('button', { name: 'Shantanu, Character, dead' })).toBeVisible();
  await expect(canvas.getByRole('button', { name: 'Bhishma, Character' })).toHaveAttribute(
    'data-life',
    'alive',
  );
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/graph-tree.png` });

  // Everyone with family links adds the spouse, drawn side by side.
  await page
    .getByRole('combobox', { name: 'Tree' })
    .selectOption({ label: 'Everyone with family links' });
  await expect(canvas.locator('.react-flow__node')).toHaveCount(3);
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);

  // GR-2: the web shows every entry; nothing is future at the end of time; kinds filter links.
  await tabs.getByRole('tab', { name: 'Family trees' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/view=web/);
  const web = page.getByRole('group', { name: 'Relationship web' });
  await expect(web.locator('.react-flow__node')).toHaveCount(6);
  await expect(web.locator('.react-flow__edge')).toHaveCount(6);
  await expect(web.locator('.react-flow__edge.future')).toHaveCount(0);
  await expect(web.getByText('teacher of')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/graph-web.png` });
  await page.getByRole('checkbox', { name: 'Teachers and students' }).uncheck();
  await expect(web.locator('.react-flow__edge')).toHaveCount(5);
  await page.getByRole('checkbox', { name: 'Dynasties' }).uncheck();
  await expect(web.locator('.react-flow__node')).toHaveCount(5);

  // Clicking a node opens its codex entry.
  await web.getByRole('button', { name: 'Drona, Character' }).click();
  await expect(page).toHaveURL(new RegExp(`/codex\\?e=${drona}`));
  await expect(page.getByRole('article', { name: 'Drona' })).toBeVisible();

  // GR-3: lineage grows with the hop count; clicking a node re-centres on it.
  await page.goto(`/projects/${project.id}/graph?view=lineage`);
  await page.getByLabel('Search entries').fill('arj');
  await page.getByRole('combobox', { name: 'Entry' }).selectOption({ label: 'Arjuna' });
  await expect(page).toHaveURL(new RegExp(`root=${arjuna}`));
  await page.getByRole('combobox', { name: 'Hops' }).selectOption('1');
  const lin = page.getByRole('group', { name: 'Lineage' });
  await expect(lin.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Hops' }).selectOption('2');
  await expect(lin.locator('.react-flow__node')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Hops' }).selectOption('4');
  await expect(lin.locator('.react-flow__node')).toHaveCount(6);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/graph-lineage.png` });
  await lin.getByRole('button', { name: 'Drona, Character' }).click();
  await expect(page).toHaveURL(new RegExp(`root=${drona}`));
  await expect(page.getByRole('link', { name: 'Open Drona in the codex' })).toBeVisible();
});
