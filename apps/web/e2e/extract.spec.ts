import { expect, test } from '@playwright/test';

test('extract on request, review like a pull request, resolve identities, commit as one (AI-3, AI-4, AI-5)', async ({
  page,
  request,
}) => {
  await request.post('/api/me/ai-keys', {
    data: { provider: 'anthropic', key: 'sk-ant-e2e-placeholder-EXTR' },
  });
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Extract World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const character = types.find((t: { name: string }) => t.name === 'Character').key;
  const { key: arjuna } = await (
    await request.post(`${api}/entities`, { data: { typeKey: character, name: 'Arjuna' } })
  ).json();
  const { key: workKey } = await (
    await request.post(`${api}/works`, { data: { name: 'Film', medium: 'film' } })
  ).json();
  const { key: doc } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: null, title: 'Draft' } })
  ).json();
  await request.put(`${api}/documents/${doc}/text`, {
    data: {
      text: 'INT. PALACE - DAY [[@s:s1]]\n\nArjun bows to Drona. Kunti watches.\n\nEXT. FIELD - NIGHT [[@s:s2]]\n\nShakuni smiles.',
      baseVersion: 0,
    },
  });

  // Extract the whole document; the e2e worker answers from the mock model.
  await page.goto(`/projects/${project.id}/d/${doc}`);
  await page.getByRole('button', { name: 'Extract', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Extract' });
  await expect(
    panel.getByRole('button', { name: 'Extract scene EXT. FIELD - NIGHT' }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Extract whole document' }).click();
  await expect(panel).toContainText('This run cost', { timeout: 30_000 });
  await panel.getByRole('link', { name: 'Review 4 proposed changes' }).click();

  // Review: highlights in the source, confidence, and an uncertain match that asks.
  await expect(page.getByRole('heading', { name: 'Review extracted changes' })).toBeVisible();
  const source = page.getByRole('region', { name: 'Source text' });
  await expect(source.locator('mark')).toHaveCount(4);
  const card = (name: string) => page.getByRole('article', { name: `Character “${name}”` });
  await expect(card('Drona')).toContainText('95% sure');
  await expect(card('Arjun')).toContainText('Is this an entry you already have?');
  await expect(card('Arjun').getByRole('button', { name: 'Accept' })).toBeDisabled();

  await page.getByRole('button', { name: 'Accept all ≥ 90%' }).click();
  await expect(card('Drona').getByRole('button', { name: 'Accepted' })).toBeVisible();
  await card('Shakuni').getByRole('button', { name: 'Reject' }).click();
  await expect(card('Shakuni').getByRole('button', { name: 'Rejected' })).toBeVisible();
  await card('Arjun').getByLabel('Arjuna (83% match)').click();
  await expect(card('Arjun').getByLabel('Arjuna (83% match)')).toBeChecked();
  await card('Arjun').getByRole('button', { name: 'Accept' }).click();
  await card('Kunti').getByRole('button', { name: 'Edit' }).click();
  await card('Kunti').getByLabel('Name').fill('Kunti Devi');
  await card('Kunti').getByRole('button', { name: 'Save edit' }).click();
  await expect(card('Kunti Devi')).toBeVisible();

  await page.getByRole('button', { name: 'Commit accepted changes (3)' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Committed 3 changes' })).toBeVisible();
  await expect(card('Drona')).toContainText('In the codex');

  // The codex has the new entries, the alias, and nothing rejected.
  await page.getByRole('link', { name: 'Open the codex' }).click();
  const entries = page.getByRole('region', { name: 'Entries' });
  await expect(entries).toContainText('Kunti Devi');
  await expect(entries).toContainText('Drona');
  await expect(entries).not.toContainText('Shakuni');
  await page.goto(`/projects/${project.id}/codex?e=${arjuna}`);
  await expect(page.getByRole('article', { name: 'Arjuna' })).toContainText('also Arjun');
});
