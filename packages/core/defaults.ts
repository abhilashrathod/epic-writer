import type { Overview, Visual } from '@epic/db';

export function emptyOverview(): Overview {
  return {
    logline: '',
    tagline: '',
    synopsisShort: '',
    synopsisLong: '',
    premise: '',
    genres: [],
    tone: '',
    hook: '',
    arc: '',
    keyQuestions: [],
    themeKeys: [],
  };
}

export function emptyVisual(): Visual {
  return { palette: [], moodKeywords: [], moodboardAssetIds: [] };
}
