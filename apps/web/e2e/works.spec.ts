import { expect, test } from '@playwright/test';

test('build a series in the works tree: add, rename, reorder, delete', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Tree World' } })
  ).json();
  await page.goto(`/projects/${project.id}`);

  await expect(page.getByRole('heading', { name: 'Start a work' })).toBeVisible();
  await page.getByLabel('Work name').fill('The Series');
  await page.getByRole('button', { name: 'Create work' }).click();

  const works = page.getByRole('complementary', { name: 'Works' });
  await works.getByRole('button', { name: '+ Add season' }).click();
  await works.getByRole('button', { name: '+ Add season' }).click();
  await works.getByRole('button', { name: 'Actions for Season 1' }).click();
  await page.getByRole('menuitem', { name: 'Add episode' }).click();
  await expect(works.getByRole('link', { name: 'Episode 1' })).toBeVisible();

  await works.getByRole('button', { name: 'Actions for Episode 1' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await works.getByLabel('New title for Episode 1').fill('The Vow');
  await works.getByRole('button', { name: 'Save' }).click();
  await expect(works.getByRole('link', { name: 'The Vow' })).toBeVisible();

  await works.getByRole('button', { name: 'Actions for Season 2' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(works.locator('li > div span').first()).toHaveText('Season 2');

  await works.getByRole('button', { name: 'Actions for Season 1' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await works.getByRole('button', { name: 'Delete Season 1' }).click();
  await expect(works.getByText('Season 1')).toHaveCount(0);
  await expect(works.getByRole('link', { name: 'The Vow' })).toHaveCount(0);
});
