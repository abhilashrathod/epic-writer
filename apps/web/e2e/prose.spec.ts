import { expect, test } from '@playwright/test';

test('prose mode highlights Markdown and splits scenes on *** (ED-5)', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Prose World' } })
  ).json();
  const base = `/api/projects/${project.id}`;
  const { key: workKey } = await (
    await request.post(`${base}/works`, { data: { name: 'The Novel', medium: 'novel' } })
  ).json();
  const { key } = await (
    await request.post(`${base}/documents`, { data: { workKey, parentKey: null } })
  ).json();
  await page.goto(`/projects/${project.id}/d/${key}`);
  await expect(page.getByRole('textbox', { name: 'Text' })).toBeFocused();

  const kb = page.keyboard;
  await kb.type('# The river');
  await kb.press('Enter');
  await kb.type('It began with a vow.');
  await kb.press('Enter');
  await kb.type('***');
  await kb.press('Enter');
  await kb.type('Years later.');

  // Markdown support loads lazily; once it has, the heading is tokenised into styled spans.
  await expect(page.locator('.cm-line').first().locator('span')).not.toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('button')).toHaveText([
    'The river',
    'Years later.',
  ]);
});
