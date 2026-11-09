import { expect, test } from '@playwright/test';

test('a mythological project starts with types; create, edit and delete a type (CX-1, CX-2, CX-11)', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Types World', templateKey: 'mythological' },
    })
  ).json();
  await page.goto(`/projects/${project.id}/codex/types`);
  const nav = page.getByRole('navigation', { name: 'Entry types' });
  await expect(nav.getByRole('button', { name: /Character/ })).toBeVisible();
  await expect(
    nav.getByRole('region', { name: 'War' }).getByRole('button', { name: /Astra/ }),
  ).toBeVisible();

  await nav.getByRole('button', { name: '+ New type' }).click();
  const form = page.getByRole('form', { name: 'New entry type' });
  await form.getByLabel('Name', { exact: true }).fill('Creature');
  await form.getByLabel('Plural', { exact: true }).fill('Creatures');
  await form.getByLabel('Group', { exact: true }).selectOption({ label: 'Land' });
  await form.getByRole('button', { name: 'Icon: river' }).click();
  await form.getByLabel(/locatable/).check();
  await expect(form.getByRole('heading', { name: 'Planned' })).toBeVisible();
  await form.getByLabel(/^born/).check();
  await expect(form.getByText('Add a Story date field for the birth date.')).toBeVisible();
  await form.getByLabel(/^born/).uncheck();
  await form.getByLabel(/^holdable/).check();
  await expect(form.getByText('Add an Entry field marked Changes over time')).toBeVisible();
  await form.getByLabel(/^holdable/).uncheck();

  await form.getByRole('button', { name: '+ Add field' }).click();
  await form.getByLabel('Label', { exact: true }).fill('Temperament');
  await form.getByLabel('Kind', { exact: true }).selectOption('enum');
  await form.getByLabel('Choices, separated by commas').fill('wild, tame');
  await form.getByLabel('Choices, separated by commas').blur();
  await expect(form.getByText('key: temperament')).toBeVisible();

  await form.getByRole('button', { name: '+ Add field' }).click();
  const second = form.getByRole('listitem').nth(1);
  await second.getByLabel('Label', { exact: true }).fill('Rider');
  await second.getByLabel('Kind', { exact: true }).selectOption('entityRef');
  await second.getByLabel('Character').check();
  await form.getByRole('button', { name: 'Create type' }).click();

  const creature = nav
    .getByRole('region', { name: 'Land' })
    .getByRole('button', { name: /Creature/ });
  await expect(creature).toHaveAttribute('aria-current', 'true');
  await expect(creature).toContainText('2');

  // Edit: saved field keys stay fixed even when the label changes.
  const edit = page.getByRole('form', { name: 'Edit Creature' });
  await edit.getByRole('listitem').first().getByLabel('Label', { exact: true }).fill('Nature');
  await expect(edit.getByText('key: temperament')).toBeVisible();
  await edit.getByRole('button', { name: 'Save type' }).click();
  await expect(edit.getByRole('listitem').first().getByLabel('Label', { exact: true })).toHaveValue(
    'Nature',
  );

  await edit.getByRole('button', { name: 'Delete type…' }).click();
  await edit.getByRole('button', { name: 'Delete Creature' }).click();
  await expect(nav.getByRole('button', { name: /Creature/ })).toHaveCount(0);
});

test('shows why a type cannot be saved', async ({ page, request }) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Bad Types', templateKey: 'blank' } })
  ).json();
  await page.goto(`/projects/${project.id}/codex/types`);
  await page.getByRole('button', { name: '+ New type' }).click();
  const form = page.getByRole('form', { name: 'New entry type' });
  await form.getByLabel('Name', { exact: true }).fill('Omen');
  await form.getByLabel('Plural', { exact: true }).fill('Omens');
  await form.getByRole('button', { name: '+ Add field' }).click();
  await form.getByLabel('Label', { exact: true }).fill('Sign');
  await form.getByLabel('Kind', { exact: true }).selectOption('enum');
  await form.getByRole('button', { name: 'Create type' }).click();
  await expect(form.getByRole('alert')).toHaveText('"Sign" needs at least one choice');
});

test('create an entry from a template found by search (CX-1)', async ({ page, request }) => {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Template World', templateKey: 'blank' },
    })
  ).json();
  await page.goto(`/projects/${project.id}/codex`);
  await page.getByRole('link', { name: 'Create from template' }).click();
  await expect(page).toHaveURL(/codex\/templates/);
  const picker = page.getByRole('region', { name: 'Create from template' });
  await expect(picker.getByRole('region', { name: 'Civilisation' })).toBeVisible();

  await picker.getByLabel('Search templates').fill('hut');
  await expect(picker.getByRole('region', { name: 'War' })).toHaveCount(0);
  await picker.getByRole('button', { name: /Dwelling/ }).click();

  const form = page.getByRole('form', { name: 'New entry' });
  await form.getByLabel('Name', { exact: true }).fill('River hut');
  await form.getByRole('button', { name: /^Next/ }).click();
  await form.getByLabel('Dwelling kind').selectOption('hut');
  await form.getByRole('button', { name: 'Save to codex' }).click();
  await expect(page.getByRole('complementary', { name: 'River hut' })).toBeVisible();
  await page.getByRole('link', { name: 'Create from template' }).click();
  await expect(page.getByRole('button', { name: /Dwelling.*In project/ })).toBeVisible();
});

test('a long type opens as a wizard with themed steps, on its own page', async ({
  page,
  request,
}) => {
  const { project } = await (
    await request.post('/api/projects', { data: { name: 'Wizard World', templateKey: 'blank' } })
  ).json();
  await request.post(`/api/projects/${project.id}/type-templates`, { data: { id: 'character' } });
  await page.goto(`/projects/${project.id}/codex`);
  await page.getByRole('link', { name: 'New entry' }).click();
  await expect(page).toHaveURL(/codex\/new/);

  const form = page.getByRole('form', { name: 'New entry' });
  await form.getByLabel('Name', { exact: true }).fill('Asha');
  const steps = form.getByRole('navigation', { name: 'Steps' });
  await steps.getByRole('button', { name: /Appearance/ }).click();
  await form.getByLabel('Hair', { exact: true }).fill('Black');
  await expect(steps.getByRole('button', { name: /Appearance/ })).toContainText('1/11');
  await form.getByRole('button', { name: 'Back' }).click();
  await expect(form.getByRole('heading', { name: 'Life and status' })).toBeVisible();
  await form.getByRole('button', { name: 'Save to codex' }).click();

  const detail = page.getByRole('article', { name: 'Asha' });
  await expect(detail).toContainText('Black');
  await detail.getByRole('button', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole('form', { name: 'Edit Asha' })).toBeVisible();
});
