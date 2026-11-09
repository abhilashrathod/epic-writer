import { describe, expect, it } from 'vitest';
import {
  canonicalNarrativeRef,
  currentNarrativeOrder,
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

  it.each(['the finale', 'S09E09', ''])('leaves %j unresolved', (text) => {
    expect(target(text, 'tv')).toBe('unresolved');
  });

  it.each([
    ['S1', 's1'],
    ['Season 1', 's1'],
    ['First Season', 's1'],
    ['0001', 's1'],
    ['Season 2', 's2'],
  ])('takes %s as a whole container', (text, documentKey) => {
    expect(target(text, 'tv')).toMatchObject({ documentKey, sceneKey: null });
  });

  it('reads a container in a level-named work', () => {
    expect(target('Book 1')).toMatchObject({ workKey: 'nv', documentKey: 'b1' });
  });

  it('counts a container at its last scene, so it never reveals early', () => {
    expect(target('S1', 'tv')).toMatchObject({ order: '0001.0002.0002' });
    // Its last episode has no scenes yet.
    expect(target('Season 2', 'tv')).toMatchObject({ order: '0002.0002' });
  });
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
});

describe('currentNarrativeOrder', () => {
  const ref = (documentKey: string, sceneKey: string | null, order = '0009.0009.0003') => ({
    workKey: 'tv',
    documentKey,
    sceneKey,
    order,
  });

  it('reads the order from the keys', () => {
    expect(currentNarrativeOrder(ref('e2', 'c'), index)).toBe('0001.0002.0002');
    expect(currentNarrativeOrder(ref('e2', null), index)).toBe('0001.0002');
    expect(currentNarrativeOrder(ref('s1', null), index)).toBe('0001.0002.0002');
  });

  it('keeps a gone scene under its episode, and a gone episode as it was', () => {
    expect(currentNarrativeOrder(ref('e2', 'gone'), index)).toBe('0001.0002.0003');
    expect(currentNarrativeOrder(ref('gone', null), index)).toBe('0009.0009.0003');
  });

  it('puts an empty container past anything that could be inside it', () => {
    const empty = { ...index, documents: [doc('x', 'tv', 'season', 3, '0003', '', 'container')] };
    expect(currentNarrativeOrder(ref('x', null), empty)).toBe('0003.9999');
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

  it('accepts a whole container, at its end, but not a scene of one', () => {
    const r = { workKey: 'tv', documentKey: 's1', sceneKey: null, order: '1' };
    expect(canonicalNarrativeRef(r, index)?.order).toBe('0001.0002.0002');
    expect(canonicalNarrativeRef({ ...r, sceneKey: 'a' }, index)).toBeNull();
  });

  it('refuses gone places and scenes of another episode', () => {
    const r = { workKey: 'tv', documentKey: 'gone', sceneKey: null, order: '1' };
    expect(canonicalNarrativeRef(r, index)).toBeNull();
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
