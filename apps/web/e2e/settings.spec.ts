import { expect, test, type APIRequestContext } from '@playwright/test';

// A real 1×1 PNG, so the browser can read its size and draw it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

async function seed(request: APIRequestContext, name: string) {
  const { project } = await (
    await request.post('/api/projects', { data: { name, templateKey: 'mythological' } })
  ).json();
  return { id: project.id as string, api: `/api/projects/${project.id}` };
}

test('project settings: rename, archive and restore, calendars, units (PR-1, PR-3, PR-4)', async ({
  page,
  request,
}) => {
  test.slow();
  const { id } = await seed(request, 'Settings World');
  await page.goto(`/projects/${id}/settings`);

  const general = page.getByRole('region', { name: 'Project' });
  await general.getByLabel('Project name').fill('Renamed World');
  await general.getByRole('button', { name: 'Rename project' }).click();
  await expect(page.getByRole('navigation', { name: 'Project' }).locator('..')).toContainText(
    'Renamed World',
  );

  // A second calendar whose day 0 is story day 360 reads story day 360 as its year 1.
  const cals = page.getByRole('region', { name: 'Calendars' });
  await cals.getByRole('button', { name: '+ New calendar' }).click();
  const form = cals.getByRole('form', { name: 'Add calendar' });
  await form.getByLabel('Calendar name').fill('Later Reckoning');
  await form.getByLabel('Its day 0 falls on story day').fill('360');
  await form.getByLabel('Month 1 name').fill('Dawn');
  await form.getByLabel('Month 1 days').fill('360');
  await form.getByLabel('Era 1 name').fill('Later Age');
  await form.getByLabel('Era 1 abbreviation').fill('LA');
  await form.getByRole('button', { name: 'Add calendar' }).click();
  await cals.getByLabel('Preview story day').fill('360');
  await expect(cals.getByLabel('Later Reckoning reads')).toHaveText('1 Dawn 1 LA');
  await cals.getByRole('button', { name: 'Make default' }).click();
  await expect(cals.getByText('Default', { exact: true })).toBeVisible();
  await expect(cals.getByRole('button', { name: 'Delete Later Reckoning' })).toHaveCount(0);

  const units = page.getByRole('region', { name: 'Units' });
  await units.getByRole('button', { name: '+ Add unit' }).click();
  const last = (await units.getByRole('row').count()) - 1;
  await units.getByLabel(`Unit ${last} name`).fill('League');
  await units.getByLabel(`Unit ${last} abbreviation`).fill('lg');
  await units.getByLabel(`Unit ${last} size`).fill('4800');
  await units.getByRole('button', { name: 'Save units' }).click();
  await expect(units.getByText('Units saved.')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Units' }).getByLabel(`Unit ${last} name`),
  ).toHaveValue('League');

  await page.getByRole('button', { name: 'Archive project' }).click();
  await expect(page.getByText('This project is archived.')).toBeVisible();
  await page.goto('/');
  const archived = page.getByRole('region', { name: 'Archived projects' });
  await expect(archived).toContainText('Renamed World');
  await archived.getByRole('button', { name: 'Restore Renamed World' }).click();
  await expect(page.getByRole('region', { name: 'Archived projects' })).toHaveCount(0);
});

test('overview, visual references with a mood board, inspirations, entry images (PR-5, PR-6, PR-7, CX-2, CX-5)', async ({
  page,
  request,
}) => {
  test.slow();
  const { id, api } = await seed(request, 'Overview World');
  await page.goto(`/projects/${id}/overview`);

  const overview = page.getByRole('form', { name: 'Overview' });
  await overview.getByLabel('Logline').fill('A prince gives up a throne.');
  await overview.getByLabel('Genres, comma-separated').fill('Myth, War');
  await overview.getByLabel('Key questions, one per line').fill('Who rules?\nAt what cost?');
  await overview.getByRole('button', { name: 'Save overview' }).click();
  await expect(overview.getByText('Saved.')).toBeVisible();

  const visual = page.getByRole('region', { name: 'Visual references' });
  await visual.getByRole('button', { name: '+ Add colour' }).click();
  await visual.getByLabel('Mood keywords, comma-separated').fill('dusk, smoke');
  await visual.getByRole('button', { name: 'Save palette and keywords' }).click();
  await visual
    .getByLabel('Mood board images to upload')
    .setInputFiles([png('a.png'), png('b.png')]);
  await expect(visual.getByRole('img', { name: 'Mood board image 2' })).toBeVisible();
  await expect
    .poll(() =>
      visual
        .getByRole('img', { name: 'Mood board image 1' })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);

  const insp = page.getByRole('region', { name: 'Inspirations' });
  await insp.getByRole('button', { name: '+ Add inspiration' }).click();
  await insp.getByLabel('Inspiration 1 title').fill('The Iliad');
  await insp.getByLabel('Inspiration 1 kind').selectOption('myth');
  await insp.getByRole('button', { name: 'Save inspirations' }).click();
  await expect(insp.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('form', { name: 'Overview' }).getByLabel('Logline')).toHaveValue(
    'A prince gives up a throne.',
  );
  await expect(page.getByLabel('Inspiration 1 title')).toHaveValue('The Iliad');
  await expect(page.getByRole('img', { name: 'Mood board image 2' })).toBeVisible();
  await expect(page.getByLabel('Palette colour 1')).toHaveValue(/^#[0-9a-f]{6}$/);

  // An entry type with an image field, and an entry with images of its own.
  const { types } = await (await request.get(`${api}/entity-types`)).json();
  const { key: typeKey } = await (
    await request.post(`${api}/entity-types`, {
      data: {
        name: 'Banner',
        pluralName: 'Banners',
        group: types[0].group,
        fields: [{ key: 'emblem', label: 'Emblem', kind: 'image' }],
      },
    })
  ).json();
  const { key } = await (
    await request.post(`${api}/entities`, { data: { typeKey, name: 'Palm Banner' } })
  ).json();
  await page.goto(`/projects/${id}/codex?e=${key}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  const form = page.getByRole('form', { name: 'Edit Palm Banner' });
  await form.getByLabel('Upload images: choose files').setInputFiles([png('c.png'), png('d.png')]);
  await expect(form.getByLabel('Image 2 caption')).toBeVisible();
  await form.getByLabel('Image 2 caption').fill('At dawn');
  await form.getByRole('button', { name: 'Next: Details' }).click();
  await form.getByLabel('Upload Emblem: choose files').setInputFiles(png('e.png'));
  await expect(form.getByRole('img', { name: 'Emblem' })).toBeVisible();
  await form.getByRole('button', { name: 'Save entry' }).click();

  const detail = page.getByRole('article', { name: 'Palm Banner' });
  await expect(detail.getByRole('img', { name: 'At dawn' })).toBeVisible();
  await expect(detail.getByRole('img', { name: 'Emblem' })).toBeVisible();
});
