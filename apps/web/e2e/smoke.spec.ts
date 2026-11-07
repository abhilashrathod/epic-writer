import { expect, test } from '@playwright/test';

test('create a project and see it listed', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText('A project is a world: one codex, any number of works.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('Test World');
  await page.getByRole('button', { name: 'Create project' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Test World' });
  await expect(row).toContainText('1 commit');
});

test('switching skin and theme persists across reloads', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-skin', 'ink');

  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitemradio', { name: 'Sand' }).click();
  await expect(html).toHaveAttribute('data-skin', 'sand');

  await page.getByRole('button', { name: 'User menu' }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/me/preferences'));
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await saved;

  await page.reload();
  await expect(html).toHaveAttribute('data-skin', 'sand');
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('health reports mongo up', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, mongo: 'up' });
});
