import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/** A mythological project with Bhishma (alias Devavrata) and one episode; returns ids and URLs. */
async function setup(request: APIRequestContext) {
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Mention World', templateKey: 'mythological' },
    })
  ).json();
  const api = `/api/projects/${project.id}`;
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const typeKey = (n: string) => types.find((t: { name: string }) => t.name === n).key;
  const { key: bhishma } = await (
    await request.post(`${api}/entities`, {
      data: {
        typeKey: typeKey('Character'),
        name: 'Bhishma',
        aliases: ['Devavrata'],
        summary: 'Keeper of the vow.',
      },
    })
  ).json();
  const { key: workKey } = await (
    await request.post(`${api}/works`, { data: { name: 'Series', medium: 'series' } })
  ).json();
  const { key: season } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: null } })
  ).json();
  const { key: episode } = await (
    await request.post(`${api}/documents`, { data: { workKey, parentKey: season } })
  ).json();
  return {
    api,
    bhishma,
    typeKey,
    url: `/projects/${project.id}/d/${episode}`,
    textApi: `${api}/documents/${episode}/text`,
  };
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('textbox', { name: 'Script' })).toBeFocused();
}

test('@ mention by alias, card on click, and the link survives a rename (ED-6)', async ({
  page,
  request,
}) => {
  const s = await setup(request);
  await open(page, s.url);
  await page.keyboard.type('INT. HALL - DAY');
  await page.keyboard.press('Enter');
  await page.keyboard.type('@Deva');
  await expect(page.getByRole('option', { name: /Devavrata/ })).toContainText('→ Bhishma');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type(' bows.');

  const mention = page.locator('.cm-mention');
  await expect(mention).toHaveText('Devavrata');
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect((await (await request.get(s.textApi)).json()).text).toContain(
    `[[@e:${s.bhishma}|Devavrata]] bows.`,
  );

  // The outline lists the entries in each scene (ED-7).
  await expect(page.getByRole('list', { name: 'Scenes' })).toContainText('Bhishma');

  await request.put(`${s.api}/entities/${s.bhishma}`, {
    data: {
      typeKey: s.typeKey('Character'),
      name: 'Gangeya',
      aliases: ['Devavrata'],
      summary: 'Keeper of the vow.',
    },
  });
  await page.reload();
  await page.locator('.cm-mention').click();
  const card = page.getByRole('dialog', { name: 'Card for Gangeya' });
  await expect(card).toContainText('Keeper of the vow.');
  await card.getByRole('link', { name: 'Open in codex →' }).click();
  await expect(page.getByRole('article', { name: 'Gangeya' })).toBeVisible();
});

test('cue autocomplete offers characters in caps (ED-4)', async ({ page, request }) => {
  const s = await setup(request);
  await open(page, s.url);
  await page.keyboard.type('The hall waits.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('DEV');
  await expect(page.getByRole('option', { name: /DEVAVRATA/ })).toBeVisible();
  // CodeMirror ignores Enter for ~75 ms after the list changes, so a fast typist can't accept by accident.
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); // accepts the suggestion, not the screenplay Enter
  await expect(page.locator('.cm-line').last()).toHaveText('DEVAVRATA');
  await page.keyboard.press('Enter'); // now the cue's Enter: straight to dialogue
  await page.keyboard.type('I take the vow.');
  await expect(page.locator('.cm-fountain-character')).toHaveText('DEVAVRATA');
  await expect(page.locator('.cm-fountain-dialogue')).toHaveText('I take the vow.');
});

test('Add to codex turns a selected name into a new entry and a mention (ED-12)', async ({
  page,
  request,
}) => {
  const s = await setup(request);
  await open(page, s.url);
  await page.keyboard.type('They reach Hastinapura at dusk.');
  // Select "Hastinapura".
  await page.keyboard.press('Home');
  for (let i = 0; i < 'They reach '.length; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 'Hastinapura'.length; i++) await page.keyboard.press('Shift+ArrowRight');

  await page.getByRole('button', { name: 'Add to codex' }).click();
  const panel = page.getByRole('complementary', { name: 'Add to codex' });
  await expect(panel.getByLabel('Name', { exact: true })).toHaveValue('Hastinapura');
  await panel.getByLabel('Type', { exact: true }).selectOption({ label: 'Kingdom' });
  await panel.getByRole('button', { name: 'Save to codex' }).click();

  await expect(page.locator('.cm-mention')).toHaveText('Hastinapura');
  await expect(page.locator('.cm-line').first()).toHaveText('They reach Hastinapura at dusk.');
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect((await (await request.get(s.textApi)).json()).text).toMatch(
    /They reach \[\[@e:[0-9a-f-]{36}\|Hastinapura\]\] at dusk\./,
  );
});
