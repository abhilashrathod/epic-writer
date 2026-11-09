import { expect, test } from '@playwright/test';

test('ask the codex: the answer cites the card it used and shows the cost (AI-8, AI-10)', async ({
  page,
  request,
}) => {
  await request.post('/api/me/ai-keys', {
    data: { provider: 'anthropic', key: 'sk-ant-e2e-placeholder-ASK1' },
  });
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Ask World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const typeKey = types.find((t: { name: string }) => t.name === 'Character').key;
  for (const name of ['Archer Prince', 'River Queen'])
    await request.post(`${api}/entities`, {
      data: { typeKey, name, summary: `${name} of the old songs.`, prominence: 'main' },
    });

  await page.goto(`/projects/${project.id}/ask`);
  await expect(page.getByText('Answering as of')).toContainText('the end of the story');
  await page.getByLabel('Your question').fill('Who is the Archer Prince?');
  await page.getByLabel('Include planned endings').check();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();

  const answer = page.getByRole('article', { name: 'Who is the Archer Prince?' });
  await expect(answer).toContainText('The codex has a card for Archer Prince.');
  const cards = answer.getByRole('region', { name: 'Cards used' });
  await expect(cards.getByRole('link')).toHaveCount(1);
  await expect(cards.getByRole('link')).toContainText('Archer Prince');
  await expect(answer).toContainText(/This run cost/);

  // The toggle is per question.
  await expect(page.getByLabel('Include planned endings')).not.toBeChecked();

  // A second question moves the first into this session's history.
  await page.getByLabel('Your question').fill('Who rules the moon?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Who rules the moon?' })).toContainText(
    'doesn’t say',
  );
  await expect(
    page
      .getByRole('region', { name: 'Earlier questions' })
      .getByRole('article', { name: 'Who is the Archer Prince?' }),
  ).toBeVisible();

  await cards.getByRole('link').click();
  await expect(page).toHaveURL(/\/codex\?e=/);
});
