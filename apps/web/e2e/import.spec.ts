import { expect, test } from '@playwright/test';
import { tinyDocx, tinyPdf } from './fixture-files';

test('import notes, extract them in one batch and review them in turn (IO-1)', async ({
  page,
  request,
}) => {
  await request.post('/api/me/ai-keys', {
    data: { provider: 'anthropic', key: 'sk-ant-e2e-placeholder-IMPT' },
  });
  const { project } = await (
    await request.post('/api/projects', {
      data: { name: 'Import World', templateKey: 'mythological' },
    })
  ).json();

  await page.goto(`/projects/${project.id}/codex`);
  await page.getByRole('link', { name: 'Import notes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Import notes' })).toBeVisible();

  await page.getByLabel('Choose note files').setInputFiles([
    {
      name: 'Harbor.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# harbor notes\n\nMira sails.'),
    },
    { name: 'Watch.txt', mimeType: 'text/plain', buffer: Buffer.from('Tobin keeps watch.') },
    {
      name: 'Mill.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: tinyDocx(['Odette runs the mill.']),
    },
    { name: 'Road.pdf', mimeType: 'application/pdf', buffer: tinyPdf(['Corwin walks the road.']) },
    { name: 'Tool.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
  ]);

  const notes = page.getByRole('region', { name: 'Imported notes' }).last();
  for (const title of ['Harbor', 'Watch', 'Mill', 'Road']) {
    await expect(notes.getByRole('link', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('alert').filter({ hasText: 'Tool.exe' })).toContainText(
    'Tool.exe: Import Markdown',
  );
  // The sidebar's works tree shows the new work too.
  await expect(page.getByRole('region', { name: 'Imported notes' }).first()).toContainText(
    'Harbor',
  );
  await expect(notes).toContainText('Not extracted');

  // One click queues every note; the e2e worker answers from the mock model.
  await page.getByRole('button', { name: 'Extract all not yet extracted (4)' }).click();
  const batch = page.getByRole('region', { name: 'Extraction' });
  await expect(batch).toContainText('4 of 4 notes extracted', { timeout: 60_000 });
  await expect(batch).toContainText('Extraction so far cost');
  await expect(batch).toContainText('4 changes waiting for review in 4 notes');
  await expect(notes.getByRole('link', { name: 'Review 1 change' })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Extract all not yet extracted' })).toBeDisabled();

  // Review the queue one run at a time.
  await page.getByRole('link', { name: 'Review next' }).click();
  await expect(page.getByRole('heading', { name: 'Review extracted changes' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Character “Mira”' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept all ≥ 90%' }).click();
  await page.getByRole('button', { name: 'Commit accepted changes (1)' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Committed 1 change' })).toBeVisible();

  await page.goto(`/projects/${project.id}/import`);
  await expect(batch).toContainText('3 changes waiting for review in 3 notes');
  await expect(notes.getByRole('link', { name: 'Reviewed' })).toHaveCount(1);
});
