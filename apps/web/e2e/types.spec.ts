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
