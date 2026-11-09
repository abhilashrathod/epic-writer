import { describe, expect, it } from 'vitest';
import {
  canonicalNarrativeRef,
  describeNarrativeRef,
  labelOnlyRef,
  narrativeItems,
  narrativeRefReached,
  needsSceneLink,
  resolveNarrativeRef,
  type NarrativeIndex,
} from './narrative-refs';

const series = {
  key: 'tv',
  name: 'Series',
  levels: [
    { key: 'season', singular: 'Season', plural: 'Seasons' },
    { key: 'episode', singular: 'Episode', plural: 'Episodes' },
  ],
};
const novel = {
  key: 'nv',
  name: 'Novel',
  levels: [
    { key: 'book', singular: 'Book', plural: 'Books' },
    { key: 'chapter', singular: 'Chapter', plural: 'Chapters' },
  ],
};
const doc = (
  key: string,
  workKey: string,
  levelKey: string,
  number: number,
  orderPath: string,
  title = '',
  kind: 'container' | 'text' = 'text',
) => ({ key, workKey, levelKey, number, orderPath, title, kind });
const scene = (sceneKey: string, documentKey: string, order: string, heading: string) => ({
  sceneKey,
  documentKey,
  order,
  heading,
});

const index: NarrativeIndex = {
  works: [series, novel],
  documents: [
    doc('s1', 'tv', 'season', 1, '0001', 'First Season', 'container'),
    doc('e1', 'tv', 'episode', 1, '0001.0001', 'Early Oath'),
    doc('e2', 'tv', 'episode', 2, '0001.0002', 'The Bridge'),
    doc('s2', 'tv', 'season', 2, '0002', '', 'container'),
    doc('e21', 'tv', 'episode', 2, '0002.0002', 'Second Bridge'),
    doc('b1', 'nv', 'book', 1, '0001', 'Book of Rivers', 'container'),
    doc('c4', 'nv', 'chapter', 4, '0001.0004', 'The Ford'),
  ],
  scenes: [
    scene('a', 'e1', '0001.0001.0001', 'INT. PALACE - DAY'),
    scene('b', 'e2', '0001.0002.0001', 'EXT. BRIDGE - NIGHT'),
    scene('c', 'e2', '0001.0002.0002', 'INT. PALACE - DAY'),
  ],
};

const target = (text: string, workKey?: string) => {
  const r = resolveNarrativeRef(text, index, workKey);
  return r.status === 'resolved' ? r.ref : r.status;
};

describe('resolveNarrativeRef', () => {
  it.each([
    ['S01E02', 'e2'],
    ['s1e2', 'e2'],
    ['S1 E2', 'e2'],
    ['Season 1, Episode 2', 'e2'],
    ['S02 ep 2', 'e21'],
  ])('reads the shorthand %s through the level names', (text, documentKey) => {
    expect(target(text, 'tv')).toMatchObject({ workKey: 'tv', documentKey, sceneKey: null });
  });

  it('reads a scene number within an episode', () => {
    expect(target('S1 E2 sc 2', 'tv')).toMatchObject({
      documentKey: 'e2',
      sceneKey: 'c',
      order: '0001.0002.0002',
    });
    expect(target('S1 E2 sc 9', 'tv')).toBe('unresolved');
  });

  it("uses each work's own levels, finding the right work without being told", () => {
    expect(target('Book 1 ch 4')).toMatchObject({ workKey: 'nv', documentKey: 'c4' });
    expect(target('S01E02')).toMatchObject({ workKey: 'tv', documentKey: 'e2' });
    expect(target('Book 1 ch 4', 'tv')).toBe('unresolved');
  });

  it('finds titles, headings and order paths, ignoring case and spacing', () => {
    expect(target('  early   OATH ')).toMatchObject({ documentKey: 'e1' });
    expect(target('ext. bridge - night')).toMatchObject({ sceneKey: 'b' });
    expect(target('0001.0002.0001')).toMatchObject({ sceneKey: 'b' });
  });

  it('asks which one for a duplicate slugline, naming both places', () => {
    const r = resolveNarrativeRef('INT. PALACE - DAY', index);
    expect(r.status).toBe('ambiguous');
    if (r.status !== 'ambiguous') return;
    expect(r.options.map((o) => o.ref.sceneKey)).toEqual(['a', 'c']);
    expect(r.options[0]!.target).toContain('Early Oath');
    expect(r.options[1]!.target).toContain('The Bridge');
  });

  it('asks which one when shorthand fits several places', () => {
    expect(target('E2', 'tv')).toBe('ambiguous');
  });

  it.each(['the finale', 'S09E09', '', 'S1', 'First Season', '0001'])(
    'leaves %j unresolved, since containers are not targets',
    (text) => {
      expect(target(text, 'tv')).toBe('unresolved');
    },
  );
});

describe('narrativeRefReached', () => {
  const place = { workKey: 'tv', documentKey: 'e2', sceneKey: null, order: '0001.0002' };
  const at = (order: string | null, workKey: string | null = 'tv') => ({
    storyTime: null,
    workKey,
    order,
  });

  it('compares by order and includes the point itself', () => {
    expect(narrativeRefReached(place, at('0001.0002'))).toBe(true);
    expect(narrativeRefReached(place, at('0001.0001.9999'))).toBe(false);
  });

  it('keeps out labels and other works until the end of the story', () => {
    expect(narrativeRefReached(labelOnlyRef('x'), at('9999'))).toBe(false);
    expect(narrativeRefReached({ ...place, workKey: 'nv' }, at('9999'))).toBe(false);
    expect(narrativeRefReached(labelOnlyRef('x'), at(null))).toBe(true);
    expect(narrativeRefReached(place, at('0001.0001', null))).toBe(true);
  });

  it('follows an episode that has moved since the reference was saved', () => {
    const stale = { ...place, order: '0001.0009' };
    expect(narrativeRefReached(stale, at('0001.0002'), index)).toBe(true);
  });
});

describe('canonicalNarrativeRef', () => {
  it('takes work and order from the keys, keeping the label', () => {
    const r = { workKey: 'x', documentKey: 'e2', sceneKey: 'b', order: 'wrong', label: 'L' };
    expect(canonicalNarrativeRef(r, index)).toEqual({
      workKey: 'tv',
      documentKey: 'e2',
      sceneKey: 'b',
      order: '0001.0002.0001',
      label: 'L',
    });
  });

  it('refuses gone places, containers and scenes of another episode', () => {
    const r = { workKey: 'tv', documentKey: 'gone', sceneKey: null, order: '1' };
    expect(canonicalNarrativeRef(r, index)).toBeNull();
    expect(canonicalNarrativeRef({ ...r, documentKey: 's1' }, index)).toBeNull();
    expect(canonicalNarrativeRef({ ...r, documentKey: 'e1', sceneKey: 'b' }, index)).toBeNull();
  });

  it('passes a label-only item through', () => {
    expect(canonicalNarrativeRef(labelOnlyRef('x'), index)).toEqual(labelOnlyRef('x'));
  });
});

describe('narrative items', () => {
  it('reads single values, lists and old text items', () => {
    expect(narrativeItems(null)).toEqual([]);
    expect(narrativeItems(labelOnlyRef('a'))).toEqual([labelOnlyRef('a')]);
    expect(narrativeItems(['a'])).toEqual([labelOnlyRef('a')]);
    expect(needsSceneLink(labelOnlyRef('a'))).toBe(true);
  });

  it('describes a place by its path and scene, then its label', () => {
    const r = { workKey: 'tv', documentKey: 'e2', sceneKey: 'c', order: 'x', label: 'L' };
    expect(describeNarrativeRef(r, index)).toBe(
      'Series: First Season › The Bridge › Sc 2: INT. PALACE - DAY (L)',
    );
    expect(describeNarrativeRef(r)).toBe('L');
    expect(describeNarrativeRef(labelOnlyRef('x'), index)).toBe('x');
  });
});
