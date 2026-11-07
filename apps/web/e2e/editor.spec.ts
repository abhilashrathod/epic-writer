import { expect, test, type Page } from '@playwright/test';
import { createEpisode } from './helpers';

const line = (page: Page, type: string) => page.locator(`.cm-fountain-${type}`);

test.beforeEach(async ({ page, request }) => {
  await page.goto(await createEpisode(request));
  await expect(page.getByRole('textbox', { name: 'Script' })).toBeFocused();
});

test('auto-detects elements and follows Beat-style Enter (ED-1, ED-2, ED-3)', async ({ page }) => {
  const kb = page.keyboard;
  await kb.type('INT. HASTINAPURA PALACE - NIGHT');
  await kb.press('Enter'); // heading: Enter leaves a blank line
  await kb.type('Lamps gutter in the wind.');
  await kb.press('Enter');
  await kb.press('Enter');
  await kb.type('BHISHMA');
  await kb.press('Enter'); // cue: straight to dialogue
  await kb.type('The river remembers.');
  await kb.press('Enter');
  await kb.press('Enter'); // twice: back to action
  await kb.type('He turns away.');

  await expect(line(page, 'sceneHeading')).toHaveText('INT. HASTINAPURA PALACE - NIGHT');
  await expect(line(page, 'character')).toHaveText('BHISHMA');
  await expect(line(page, 'dialogue')).toHaveText('The river remembers.');
  await expect(line(page, 'action')).toHaveText(['Lamps gutter in the wind.', 'He turns away.']);
  const lines = await page.locator('.cm-line').allTextContents();
  expect(lines[1]).toBe(''); // blank line after the heading
});

test('Tab opens a parenthetical after a cue and cycles element types (ED-3)', async ({ page }) => {
  const kb = page.keyboard;
  await kb.type('Text.');
  await kb.press('Enter');
  await kb.press('Enter');
  await kb.type('KARNA');
  await kb.press('Enter');
  await kb.press('Tab');
  await kb.type('bitterly');
  await kb.press('End');
  await kb.press('Enter');
  await kb.type('So be it.');
  await expect(line(page, 'parenthetical')).toHaveText('(bitterly)');
  await expect(line(page, 'dialogue')).toHaveText('So be it.');

  await kb.press('Enter');
  await kb.press('Enter');
  await kb.type('Arjuna');
  await kb.press('Tab');
  await expect(page.locator('.cm-line').last()).toHaveText('@Arjuna');
  await expect(page.locator('.cm-line').last()).toHaveClass(/cm-fountain-character/);
});

test('hides scene markers, keeps the heading, and outlines scenes (ED-7)', async ({ page }) => {
  const kb = page.keyboard;
  await kb.type('INT. GATE [[@s:0190a3b4-0000-7000-8000-000000000001]]');
  await kb.press('Enter');
  await kb.type('Guards wait.');
  await kb.press('Enter');
  await kb.press('Enter');
  await kb.type('EXT. FIELD - DAWN');
  await kb.press('Enter');
  await kb.type('Mist.');

  await expect(line(page, 'sceneHeading').first()).toHaveText('INT. GATE');
  const outline = page.getByRole('list', { name: 'Scenes' });
  await expect(outline.getByRole('button')).toHaveText(['INT. GATE', 'EXT. FIELD - DAWN']);

  await outline.getByRole('button', { name: 'INT. GATE' }).click();
  await kb.type('X'); // cursor landed at the scene start; the marker stays hidden
  await expect(page.locator('.cm-line').first()).toHaveText('XINT. GATE');
});

test('focus mode hides the sidebar, keeps the text, and Esc exits (ED-11)', async ({ page }) => {
  await page.keyboard.type('INT. HALL - DAY');
  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page.getByRole('complementary', { name: 'Works' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit focus (Esc)' })).toBeVisible();
  await expect(line(page, 'sceneHeading')).toHaveText('INT. HALL - DAY');

  // Faint controls open one drawer at a time: scenes, ask, check, history, more.
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('complementary', { name: 'History' })).toBeVisible();
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('complementary', { name: 'History' })).toBeHidden();
  await expect(page.getByLabel('Continuity')).toBeVisible();
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('form', { name: 'Ask the codex' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Extract' }).click();
  await expect(page.getByLabel('Extract', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); // closes the drawer first
  await expect(page.getByLabel('Extract', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit focus (Esc)' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Works' })).toBeVisible();
  await expect(line(page, 'sceneHeading')).toHaveText('INT. HALL - DAY');
});
