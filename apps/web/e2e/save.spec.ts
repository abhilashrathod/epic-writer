import { expect, test, type Page } from '@playwright/test';
import { createEpisode } from './helpers';

const status = (page: Page) => page.getByRole('status');
const script = (page: Page) => page.getByRole('textbox', { name: 'Script' });

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(script(page)).toBeFocused();
}

test('autosaves, adds hidden scene keys, and survives a reload (ED-9)', async ({
  page,
  request,
}) => {
  const url = await createEpisode(request, 'Save World');
  await open(page, url);
  await page.keyboard.type('INT. HALL - DAY');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Lamps.');
  await expect(status(page)).toHaveText('Saved');

  const api = url.replace('/projects/', '/api/projects/').replace('/d/', '/documents/') + '/text';
  const saved = await (await request.get(api)).json();
  expect(saved.text).toMatch(/^INT\. HALL - DAY \[\[@s:[0-9a-f-]{36}\]\]\n\nLamps\.$/);

  await page.reload();
  await expect(page.locator('.cm-fountain-sceneHeading')).toHaveText('INT. HALL - DAY');
  await expect(page.locator('.cm-fountain-action')).toHaveText('Lamps.');
});

test('keeps typing on this device while offline and saves on reconnect (ED-9)', async ({
  page,
  request,
}) => {
  const url = await createEpisode(request, 'Offline World');
  await open(page, url);
  const blockSaves = (r: import('@playwright/test').Route) =>
    r.request().method() === 'PUT' ? r.abort('internetdisconnected') : r.continue();
  await page.route('**/text', blockSaves);

  await page.keyboard.type('Written on a train.');
  await expect(status(page)).toContainText('Offline');

  await page.reload(); // still offline for saves: the text comes back from the local buffer
  await expect(page.locator('.cm-line').first()).toHaveText('Written on a train.');

  await page.unroute('**/text', blockSaves);
  await expect(status(page)).toHaveText('Saved', { timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.cm-line').first()).toHaveText('Written on a train.');
});

for (const choice of ['Keep my version', 'Use the other version'] as const) {
  test(`prompts on a conflict from another device: ${choice} (ED-9)`, async ({
    browser,
    request,
  }) => {
    const url = await createEpisode(request, `Conflict ${choice}`);
    const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
    await open(a, url);
    await open(b, url);

    await a.keyboard.type('From device A.');
    await expect(status(a)).toHaveText('Saved');
    await b.keyboard.type('From device B.');
    await expect(
      b.getByRole('alert').filter({ hasText: 'changed on another device' }),
    ).toBeVisible();

    await b.getByRole('button', { name: choice }).click();
    const kept = choice === 'Keep my version' ? 'From device B.' : 'From device A.';
    const lost = choice === 'Keep my version' ? 'From device A.' : 'From device B.';
    await expect(b.locator('.cm-line').first()).toHaveText(kept);
    await expect(status(b)).toHaveText('Saved');

    await b.reload();
    await expect(b.locator('.cm-line').first()).toHaveText(kept);
    await b.getByRole('button', { name: 'History' }).click();
    const label =
      choice === 'Keep my version'
        ? 'Replaced by text from another device'
        : 'Unsaved text from this device';
    const entry = b.getByRole('listitem').filter({ hasText: label });
    await entry.getByRole('button', { name: 'Preview' }).click();
    await expect(entry.locator('pre')).toHaveText(lost);
    await Promise.all([a.close(), b.close()]);
  });
}

test('names a snapshot and restores it, keeping the replaced text (ED-10)', async ({
  page,
  request,
}) => {
  await open(page, await createEpisode(request, 'History World'));
  await page.keyboard.type('Draft one.');
  await expect(status(page)).toHaveText('Saved');

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('complementary', { name: 'History' });
  await history.getByLabel('Snapshot name').fill('Table read');
  await history.getByRole('button', { name: 'Save snapshot' }).click();
  await expect(history.getByText('Table read')).toBeVisible();

  await script(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Rewritten.');
  await expect(status(page)).toHaveText('Saved');

  const entry = history.getByRole('listitem').filter({ hasText: 'Table read' });
  await entry.getByRole('button', { name: 'Restore' }).click();
  await entry.getByRole('button', { name: 'Restore this version' }).click();
  await expect(page.locator('.cm-line').first()).toHaveText('Draft one.');
  await expect(history.getByText('Before restore')).toBeVisible();

  await page.reload();
  await expect(page.locator('.cm-line').first()).toHaveText('Draft one.');
});
