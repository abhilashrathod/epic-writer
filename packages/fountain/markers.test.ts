import { describe, expect, it } from 'vitest';
import { displayText, findMarkers, mentionMarker, sceneMarker, stripMarkers } from './markers';

const K = '0190a3b4-0000-7000-8000-000000000001';

describe('markers', () => {
  it('finds scene, mention and note markers with offsets', () => {
    const line = `INT. HALL [[@s:${K}]] with [[@e:e1|Bhishma]] and [[todo]]`;
    const [scene, mention, note] = findMarkers(line);
    expect(scene).toMatchObject({ kind: 'scene', key: K });
    expect(line.slice(scene!.from, scene!.to)).toBe(`[[@s:${K}]]`);
    expect(mention).toMatchObject({ kind: 'mention', key: 'e1', name: 'Bhishma' });
    expect(line.slice(mention!.nameFrom!, mention!.nameFrom! + 7)).toBe('Bhishma');
    expect(note).toMatchObject({ kind: 'note' });
  });

  it('finds Markdown scene markers', () => {
    expect(findMarkers(`Opening <!-- s:${K} -->`)[0]).toMatchObject({ kind: 'scene', key: K });
  });

  it('displayText shows names and hides everything else', () => {
    expect(displayText(`[[@e:e1|Bhishma]] speaks [[note]][[@s:${K}]]`)).toBe('Bhishma speaks ');
  });

  it('stripMarkers keeps notes and trims gaps left by scene markers', () => {
    expect(stripMarkers(`INT. HALL [[@s:${K}]]\n[[@e:e1|Bhishma]] waits. [[fix this]]`)).toBe(
      'INT. HALL\nBhishma waits. [[fix this]]',
    );
    expect(stripMarkers(`Opening <!-- s:${K} -->`)).toBe('Opening');
  });

  it('builds markers in both formats and cleans mention names', () => {
    expect(sceneMarker(K, 'fountain')).toBe(`[[@s:${K}]]`);
    expect(sceneMarker(K, 'markdown')).toBe(`<!-- s:${K} -->`);
    expect(mentionMarker('e1', 'Bad|Name]]')).toBe('[[@e:e1|BadName]]');
    expect(findMarkers(mentionMarker('e1', 'Ganga'))[0]).toMatchObject({
      key: 'e1',
      name: 'Ganga',
    });
  });
});
