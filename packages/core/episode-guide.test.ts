import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeadByKey } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { episodeGuide } from './episode-guide';
import { Invalid, NotFound } from './errors';
import { listCommits } from './history';
import {
  createDocument,
  createWork,
  openProject,
  setDocumentDetails,
  type ProjectContext,
} from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let workKey: string;
let season: string;
let episode: string;
let battle: string;
let hero: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, userId);
  const T = Object.fromEntries((await listEntityTypes(db, ctx)).map((t) => [t.name, t.key]));
  battle = await createEntity(db, ctx, { typeKey: T.Event, name: 'The Vow' });
  hero = await createEntity(db, ctx, { typeKey: T.Character, name: 'Bhishma' });
  workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  season = await createDocument(db, ctx, { workKey, parentKey: null, title: 'Season One' });
  episode = await createDocument(db, ctx, { workKey, parentKey: season, title: 'The River' });
});

describe('setDocumentDetails', () => {
  it('stores episode details and container arcs, skipping no-op edits', async () => {
    await setDocumentDetails(db, ctx, episode, {
      logline: 'A prince gives up a throne.',
      summary: 'Devavrata takes his vow.',
      keyEventKeys: [battle, battle],
    });
    await setDocumentDetails(db, ctx, season, { arcSummary: 'The house splits.' });
    expect(await readHeadByKey(db, 'documents', ctx.scope, episode)).toMatchObject({
      logline: 'A prince gives up a throne.',
      keyEventKeys: [battle],
    });
    const seqs = (await listCommits(db, ctx)).length;
    await setDocumentDetails(db, ctx, season, { arcSummary: 'The house splits.' });
    expect((await listCommits(db, ctx)).length).toBe(seqs);
  });

  it('rejects fields of the wrong kind and key events that are not events', async () => {
    await expect(setDocumentDetails(db, ctx, season, { logline: 'x' })).rejects.toBeInstanceOf(
      Invalid,
    );
    await expect(setDocumentDetails(db, ctx, episode, { arcSummary: 'x' })).rejects.toBeInstanceOf(
      Invalid,
    );
    await expect(
      setDocumentDetails(db, ctx, episode, { keyEventKeys: [hero] }),
    ).rejects.toBeInstanceOf(Invalid);
  });
});

describe('episodeGuide', () => {
  it('builds Markdown in reading order', async () => {
    await setDocumentDetails(db, ctx, season, { arcSummary: 'The house splits.' });
    await setDocumentDetails(db, ctx, episode, {
      logline: 'A prince gives up a throne.',
      summary: 'Devavrata takes his vow.',
      keyEventKeys: [battle],
    });
    const guide = await episodeGuide(db, ctx, workKey);
    expect(guide.title).toBe('Series: episode guide');
    expect(guide.markdown).toBe(
      [
        '# Series: episode guide',
        '## Season One',
        'The house splits.',
        '### The River',
        '_A prince gives up a throne._',
        'Devavrata takes his vow.',
        'Key events:\n- The Vow',
      ].join('\n\n') + '\n',
    );
    await expect(episodeGuide(db, ctx, 'nope')).rejects.toBeInstanceOf(NotFound);
  });
});
