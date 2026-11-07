import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('episode guide: edit details, add a key event, download (WK-5)', async ({ page, request }) => {
  const post = async (url: string, data: object) => (await request.post(url, { data })).json();
  const { project } = await post('/api/projects', {
    name: 'Guide World',
    templateKey: 'mythological',
  });
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const event = types.find((t: { name: string }) => t.name === 'Event').key;
  await post(`${api}/entities`, { typeKey: event, name: 'The Vow' });
  const { key: workKey } = await post(`${api}/works`, { name: 'The Series', medium: 'series' });
  const { key: season } = await post(`${api}/documents`, { workKey, parentKey: null });
  await post(`${api}/documents`, { workKey, parentKey: season });

  await page.goto(`/projects/${project.id}/guide`);
  await expect(page.getByRole('heading', { name: 'Episode guide' })).toBeVisible();
  await page.getByLabel('Arc summary of Season 1').fill('The house splits.');
  await page.getByLabel('Logline of Episode 1').click();
  await page.getByLabel('Logline of Episode 1').fill('A prince gives up a throne.');
  await page.getByLabel('Summary of Episode 1').click();
  await page.getByLabel('Key event to add to Episode 1').selectOption({ label: 'The Vow' });
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.getByRole('button', { name: 'Remove The Vow' })).toBeVisible();

  // Details survive a reload.
  await page.reload();
  await expect(page.getByLabel('Logline of Episode 1')).toHaveValue('A prince gives up a throne.');
  await expect(page.getByLabel('Arc summary of Season 1')).toHaveValue('The house splits.');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download guide' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('The Series episode guide.md');
  const md = await readFile(await file.path(), 'utf8');
  expect(md).toContain('## Season 1\n\nThe house splits.');
  expect(md).toContain('_A prince gives up a throne._');
  expect(md).toContain('Key events:\n- The Vow');
});
