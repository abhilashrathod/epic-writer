import { readFile } from 'node:fs/promises';
import { expect, test, type Download } from '@playwright/test';
import { createEpisode } from './helpers';

const SCRIPT = [
  'Title: The Crossing',
  'Author: A. Writer',
  '',
  'INT. HALL - DAY',
  '',
  'A guard waits by the door.',
  '',
  'EXT. RIVER - DAWN',
  '',
  'Mist over the water.',
  '',
].join('\r\n');

const text = async (d: Download) => readFile(await d.path(), 'utf8');

test('import a Fountain script, download it back and download a project backup', async ({
  page,
  request,
}) => {
  const editorUrl = await createEpisode(request, 'Fountain World');
  const projectUrl = editorUrl.replace(/\/d\/.*$/, '');
  await page.goto(editorUrl);

  const works = page.getByRole('complementary', { name: 'Works' });
  await works.getByRole('button', { name: 'Actions for Season 1' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Import Fountain…' }).click();
  await (
    await chooser
  ).setFiles({ name: 'crossing.fountain', mimeType: 'text/plain', buffer: Buffer.from(SCRIPT) });

  await expect(page.getByRole('heading', { name: 'The Crossing' })).toBeVisible();
  await expect(works.getByRole('link', { name: 'The Crossing' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const sceneList = works.getByRole('list', { name: 'Scenes' });
  await expect(sceneList.getByRole('button', { name: 'INT. HALL - DAY' })).toBeVisible();
  await expect(sceneList.getByRole('button', { name: 'EXT. RIVER - DAWN' })).toBeVisible();
  await expect(page.getByText('Author: A. Writer')).toHaveCount(0);

  const fountain = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download .fountain' }).click();
  const script = await fountain;
  expect(script.suggestedFilename()).toBe('The Crossing.fountain');
  const exported = await text(script);
  expect(exported).toContain('Title: The Crossing');
  expect(exported).toContain('INT. HALL - DAY\n\nA guard waits by the door.');
  expect(exported).not.toContain('[[@');

  await page.goto(`${projectUrl}/settings`);
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download backup' }).click();
  const backup = JSON.parse(await text(await backupDownload)) as {
    format: string;
    project: { name: string };
    collections: { documents: { title: string }[] };
  };
  expect(backup.format).toBe('epic-writer-backup');
  expect(backup.project.name).toBe('Fountain World');
  expect(backup.collections.documents.map((d) => d.title)).toEqual(
    expect.arrayContaining(['Season 1', 'Episode 1', 'The Crossing']),
  );
  expect(JSON.stringify(backup)).not.toContain('aiKeys');
});
