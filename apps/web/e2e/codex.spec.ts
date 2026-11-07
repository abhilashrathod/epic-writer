import { expect, test } from '@playwright/test';

test('codex: create with live preview, browse, search, scrap, merge and delete (CX-5, 6, 10, 12, 13)', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Codex World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const typeKey = (name: string) => types.find((t: { name: string }) => t.name === name).key;
  await request.post(`${api}/entities`, {
    data: { typeKey: typeKey('Place'), name: 'River Bank' },
  });

  await page.goto(`/projects/${project.id}/codex`);
  await page.getByRole('button', { name: 'New entry' }).click();
  const form = page.getByRole('form', { name: 'New entry' });
  await form.getByLabel('Type', { exact: true }).selectOption({ label: 'Character' });
  await form.getByLabel('Name', { exact: true }).fill('Bhishma');
  await expect(form.getByRole('group', { name: 'Card preview' })).toContainText('Bhishma'); // live preview
  await form.getByLabel('Also known as').fill('Devavrata, Grandsire');
  await form.getByLabel('Prominence').selectOption('main');
  await form.getByLabel('Story role', { exact: true }).selectOption('mentor');
  await form.getByLabel('Where they are', { exact: true }).selectOption({ label: 'River Bank' });
  await form.getByLabel('Born: precision').selectOption('year');
  await form.getByLabel('Born: year').fill('12');
  await form.getByRole('button', { name: 'Save to codex' }).click();

  const detail = page.getByRole('article', { name: 'Bhishma' });
  await expect(detail).toContainText('also Devavrata, Grandsire');
  await expect(detail.getByRole('definition').filter({ hasText: 'mentor' })).toBeVisible();
  await expect(detail.getByRole('definition').filter({ hasText: '12 A' })).toBeVisible();
  await detail.getByRole('button', { name: 'River Bank' }).click(); // references open the other entry
  await expect(page.getByRole('article', { name: 'River Bank' })).toBeVisible();

  // Browse and search by alias.
  const nav = page.getByRole('navigation', { name: 'Entry types' });
  await nav.getByRole('button', { name: /Places/ }).click();
  await expect(page.getByRole('region', { name: 'Entries' }).getByRole('listitem')).toHaveCount(1);
  await nav.getByRole('button', { name: /All entries/ }).click();
  await page.getByLabel('Search entries').fill('devavrata');
  await expect(page.getByRole('region', { name: 'Entries' }).getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Search entries').fill('');

  // Merge a duplicate created elsewhere (e.g. by extraction).
  await request.post(`${api}/entities`, {
    data: { typeKey: typeKey('Character'), name: "Ganga's son", tags: ['vow'] },
  });
  await page.reload();
  await page
    .getByRole('region', { name: 'Entries' })
    .getByRole('button', { name: /Bhishma/ })
    .click();
  await detail.getByRole('button', { name: 'Merge a duplicate…' }).click();
  await detail.getByLabel('Duplicate to merge').selectOption({ label: "Ganga's son" });
  await detail.getByRole('button', { name: 'Merge into Bhishma' }).click();
  await expect(detail).toContainText("also Devavrata, Grandsire, Ganga's son");
  await expect(
    page.getByRole('region', { name: 'Entries' }).getByText("Ganga's son", { exact: true }),
  ).toHaveCount(0);

  // Scrapped entries leave default views (CX-12).
  await detail.getByRole('button', { name: 'Edit' }).click();
  await page
    .getByRole('form', { name: 'Edit Bhishma' })
    .getByLabel('Canon state')
    .selectOption('scrapped');
  await page.getByRole('button', { name: 'Save entry' }).click();
  const grid = page.getByRole('region', { name: 'Entries' });
  await expect(grid.getByRole('button', { name: /Bhishma/ })).toHaveCount(0);
  await page.getByLabel('Show scrapped').check();
  await expect(grid.getByRole('button', { name: /Bhishma/ })).toContainText('scrapped');

  await grid.getByRole('button', { name: /Bhishma/ }).click();
  await detail.getByRole('button', { name: 'Delete…' }).click();
  await detail.getByRole('button', { name: 'Delete Bhishma' }).click();
  await expect(grid.getByRole('button', { name: /Bhishma/ })).toHaveCount(0);
});

test('shows field errors from the type', async ({ page, request }) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Codex Errors', templateKey: 'blank' } })
  ).json();
  await request.post(`/api/projects/${project.id}/entity-types`, {
    data: {
      name: 'Oath',
      pluralName: 'Oaths',
      group: 'lore',
      fields: [{ key: 'terms', label: 'Terms', kind: 'text', required: true }],
    },
  });
  await page.goto(`/projects/${project.id}/codex`);
  await page.getByRole('button', { name: 'New entry' }).click();
  const form = page.getByRole('form', { name: 'New entry' });
  await form.getByLabel('Name', { exact: true }).fill('The Oath');
  await form.getByRole('button', { name: 'Save to codex' }).click();
  await expect(form.getByRole('alert')).toContainText('Terms');
});
