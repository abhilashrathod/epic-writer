import { expect, test } from '@playwright/test';

test('a story place is picked by shorthand, or kept as a label that asks for a link', async ({
  page,
  request,
}) => {
  const post = async (url: string, data: unknown) => (await request.post(url, { data })).json();
  const { project } = await post('/api/projects', { name: 'Places', templateKey: 'blank' });
  const api = `/api/projects/${project.id}`;
  const { key: workKey } = await post(`${api}/works`, { name: 'The Series', medium: 'series' });
  const { key: season } = await post(`${api}/documents`, { workKey, parentKey: null });
  await post(`${api}/documents`, { workKey, parentKey: season, title: 'First Oath' });
  await post(`${api}/entity-types`, {
    name: 'Promise',
    pluralName: 'Promises',
    group: 'lore',
    fields: [{ key: 'paidOffAt', label: 'Paid off at', kind: 'narrativeRefList' }],
  });

  await page.goto(`/projects/${project.id}/codex`);
  await page.getByRole('link', { name: 'New entry' }).click();
  const form = page.getByRole('form', { name: 'New entry' });
  await form.getByLabel('Name', { exact: true }).fill('Bow Promise');
  await form.getByRole('button', { name: 'Next: Details' }).click();

  const typed = form.getByLabel('Paid off at: type a place');
  await typed.fill('S01E01');
  await expect(form.getByText(/Goes to .*First Oath/)).toBeVisible();
  await form.getByRole('button', { name: 'Add this place' }).click();
  await typed.fill('the finale');
  await form.getByRole('button', { name: 'Keep as a label' }).click();
  await form.getByRole('button', { name: 'Save to codex' }).click();

  const detail = page.getByRole('article', { name: 'Bow Promise' });
  await expect(detail).toContainText('First Oath');
  await expect(detail.getByText('the finale')).toBeVisible();
  await expect(detail.getByText('Needs a scene link')).toHaveCount(1);
});
