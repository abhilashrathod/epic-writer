import { expect, test } from '@playwright/test';

/**
 * AI-6, AI-7: Bhishma dies on day 100, then speaks in an episode set on day 200. The check
 * underlines his cue and lists the issue with its cost; editing the cue marks it stale, and an
 * issue can be dismissed. The worker answers from the mock model.
 */
test('continuity check underlines a dead character speaking; edits go stale, dismiss works', async ({
  page,
  request,
}) => {
  const ok = async (res: Promise<{ ok(): boolean; json(): Promise<unknown> }>) => {
    const r = await res;
    expect(r.ok()).toBe(true);
    return r;
  };
  await ok(
    request.post('/api/me/ai-keys', {
      data: { provider: 'anthropic', key: 'sk-ant-e2e-placeholder-CONT' },
    }),
  );
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Continuity World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const character = types.find((t: { name: string }) => t.name === 'Character').key;
  const { key: bhishma } = await (
    await request.post(`${api}/entities`, { data: { typeKey: character, name: 'Bhishma' } })
  ).json();
  await ok(
    request.post(`${api}/facts`, {
      data: {
        entityKey: bhishma,
        field: 'status',
        value: 'dead',
        storyTime: { start: 100, end: null, precision: 'day' },
      },
    }),
  );
  const { key: workKey } = await (
    await request.post(`${api}/works`, { data: { name: 'Series', medium: 'series' } })
  ).json();
  const { key: season } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: null } })
  ).json();
  const { key: episode } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: season } })
  ).json();
  await ok(
    request.patch(`${api}/documents/${episode}`, {
      data: { storyTime: { start: 200, end: null, precision: 'day' } },
    }),
  );
  const text = [
    'INT. HALL - DAY [[@s:0190a000-0000-7000-8000-000000000001]]',
    '',
    'A sealed chest waits by the throne.',
    '',
    `[[@e:${bhishma}|BHISHMA]]`,
    'I have returned.',
  ].join('\n');
  await ok(request.put(`${api}/documents/${episode}/text`, { data: { text, baseVersion: 0 } }));

  await page.goto(`/projects/${project.id}/d/${episode}`);
  await expect(page.getByRole('textbox', { name: 'Script' })).toBeFocused();
  await page.getByRole('button', { name: 'Continuity' }).click();
  const panel = page.getByRole('complementary', { name: 'Continuity' });
  await panel.getByRole('button', { name: 'Check continuity' }).click();

  await expect(panel.getByText(/This run cost/)).toBeVisible();
  const dead = panel.getByRole('listitem').filter({ hasText: 'Dead character acts' });
  await expect(dead).toContainText('Bhishma speaks here, but is dead');
  await expect(dead.getByRole('link', { name: 'Bhishma' })).toBeVisible();
  await expect(page.locator('.cm-issue-error .cm-mention')).toHaveText('BHISHMA');
  await expect(page.getByRole('button', { name: 'Continuity (2)' })).toBeVisible();

  // Dismiss the AI pass's note.
  const note = panel.getByRole('listitem').filter({ hasText: 'Unpaid setup' });
  await note.getByRole('button', { name: 'Dismiss' }).click();
  await expect(note).toHaveCount(0);

  // Editing the flagged cue removes the underline at once and the issue goes stale on save.
  await dead.getByRole('button', { name: 'Jump to' }).click();
  await page.keyboard.press('Delete');
  await page.keyboard.type('KARNA');
  await expect(page.locator('.cm-issue-error')).toHaveCount(0);
  await expect(dead).toContainText('Edited since the check');
  await expect(page.getByRole('button', { name: 'Continuity', exact: true })).toBeVisible();
});
