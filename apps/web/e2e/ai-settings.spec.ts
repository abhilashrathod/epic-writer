import { expect, test } from '@playwright/test';

test('save an AI key and project AI settings; the key is never shown again (AI-1, AI-2, AI-10)', async ({
  page,
  request,
}) => {
  await page.goto('/settings');
  const keys = page.getByRole('region', { name: 'AI keys' });
  await keys.getByLabel('Provider').selectOption('anthropic');
  await keys.getByLabel('API key').fill('sk-ant-e2e-placeholder-WXYZ');
  await keys.getByLabel('Label (optional)').fill('Test key');
  await keys.getByRole('button', { name: 'Save key' }).click();
  await expect(keys.getByRole('listitem').filter({ hasText: 'Anthropic' })).toContainText(
    'Test key ending in WXYZ',
  );
  const listed = await (await request.get('/api/me/ai-keys')).text();
  expect(listed).not.toContain('placeholder');

  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'AI Settings World', templateKey: 'blank' },
    })
  ).json();
  await page.goto(`/projects/${project.id}/settings`);
  const form = page.getByRole('form', { name: 'AI settings' });
  await expect(page.getByRole('region', { name: 'Spend this month' })).toContainText('$0.0000');
  await form.getByLabel('Model for ask the codex').fill('claude-haiku-5-5');
  await form.getByLabel('Monthly cap in dollars').fill('5');
  await form.getByRole('button', { name: 'Save AI settings' }).click();
  await expect(form.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await expect(page.getByLabel('Model for ask the codex')).toHaveValue('claude-haiku-5-5');
  await expect(page.getByLabel('Monthly cap in dollars')).toHaveValue('5');
});
