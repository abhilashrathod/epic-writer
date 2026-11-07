import { expect, test } from '@playwright/test';

const year = (y: number) => ({ start: (y - 1) * 360, end: null, precision: 'year' });

test('as of: episode story time, recorded changes, ages and unborn entries (GR-5, GR-6, WK-7, CX-3)', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'As Of World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { key: workKey } = await (
    await request.post(`${api}/works`, { data: { name: 'The Series', medium: 'series' } })
  ).json();
  const { key: season } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: null } })
  ).json();
  const { key: episode } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: season } })
  ).json();
  const { documents } = await (await request.get(`${api}/tree`)).json();
  const title: string = documents.find((d: { key: string }) => d.key === episode).title;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const character = types.find((t: { name: string }) => t.name === 'Character').key;
  for (const [name, born] of [
    ['Pandu', 10],
    ['Kunti', 30],
  ] as const)
    await request.post(`${api}/entities`, {
      data: { typeKey: character, name, fields: { born: year(born), status: 'alive' } },
    });

  // Set the episode's story time from the works tree; the open episode moves "as of" there.
  await page.goto(`/projects/${project.id}/d/${episode}`);
  const asOf = page.getByRole('region', { name: 'As of' });
  await expect(asOf).toContainText('End of story');
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Set story time…' }).click();
  await page.getByLabel(`When ${title} happens: precision`).selectOption('year');
  await page.getByLabel(`When ${title} happens: year`).fill('20');
  await page.getByRole('button', { name: 'Save story time' }).click();
  await expect(asOf).toContainText('20 A');

  // Back to end of story, then reopening the episode moves "as of" to it again (WK-7).
  await asOf.getByRole('button', { name: 'End of story' }).click();
  await expect(asOf).toContainText('End of story');
  await page.reload();
  await expect(asOf).toContainText('20 A');
  await expect(asOf).toContainText(`The Series · ${title}`);

  // Ages and unborn entries as of year 20 (GR-6).
  await page.getByRole('link', { name: 'Codex', exact: true }).click();
  const grid = page.getByRole('region', { name: 'Entries' });
  await expect(grid.getByRole('button', { name: /Pandu/ })).toContainText('Age 10');
  const kunti = grid.getByRole('button', { name: /Kunti/ });
  await expect(kunti).toContainText('unborn');
  await expect(kunti.locator('> *')).toHaveCSS('opacity', '0.6');

  // Record a change: Pandu dies in year 25 (CX-3).
  await grid.getByRole('button', { name: /Pandu/ }).click();
  const detail = page.getByRole('article', { name: 'Pandu' });
  await detail.getByRole('button', { name: 'Record a change' }).click();
  const form = detail.getByRole('form', { name: 'Record a change' });
  await form.getByLabel('Field').selectOption({ label: 'Status' });
  await form.getByLabel('New status').selectOption('dead');
  await form.getByLabel('When: precision').selectOption('year');
  await form.getByLabel('When: year').fill('25');
  await form.getByRole('button', { name: 'Save change' }).click();
  const changes = detail.getByRole('region', { name: 'Changes over time' });
  await expect(changes).toContainText('25 A');
  await expect(changes).toContainText('Status: dead');

  const status = detail.getByRole('definition').filter({ hasText: /^(alive|dead)$/ });
  await expect(detail.getByRole('term').filter({ hasText: 'Status' })).toContainText('as of 20 A');
  await expect(status).toHaveText('alive');

  // Move "as of" past the change: the value flips; move back: it flips back.
  await asOf.getByRole('button', { name: 'Pick a date…' }).click();
  await asOf.getByLabel('Story date: year').fill('30');
  await expect(asOf).toContainText('30 A');
  await expect(status).toHaveText('dead');
  await expect(detail).toContainText('Age 20');
  await asOf.getByLabel('Story date: year').fill('20');
  await expect(status).toHaveText('alive');

  // Removing the change returns to the starting value everywhere.
  await asOf.getByRole('button', { name: 'End of story' }).click();
  await expect(status).toHaveText('dead');
  await changes.getByRole('button', { name: /Remove change to Status/ }).click();
  await expect(status).toHaveText('alive');
});
