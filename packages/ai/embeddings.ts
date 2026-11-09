import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { mockEnabled } from './models';
import { costMicros } from './pricing';

export interface Embedder {
  modelId: string;
  embed(texts: string[]): Promise<{
    vectors: number[][];
    tokens: number;
    costMicros: number | null;
  }>;
}

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const MOCK_DIMENSIONS = 256;

/** A deterministic bag-of-words vector, so mock runs still rank by shared words. */
function mockVector(text: string): number[] {
  const v = new Array<number>(MOCK_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let h = 0;
    for (const c of word) h = (h * 31 + c.charCodeAt(0)) % MOCK_DIMENSIONS;
    v[h]! += 1;
  }
  return v;
}

/** Embeddings need an OpenAI key (Anthropic has no embedding API). Null means none is available. */
export function createEmbedder(apiKey: string | null, modelId?: string): Embedder | null {
  if (mockEnabled())
    return {
      modelId: 'mock',
      embed: async (texts) => ({
        vectors: texts.map(mockVector),
        tokens: texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
        costMicros: 0,
      }),
    };
  if (!apiKey) return null;
  const id = modelId || DEFAULT_EMBEDDING_MODEL;
  const model = createOpenAI({ apiKey }).embedding(id);
  return {
    modelId: id,
    embed: async (values) => {
      const res = await embedMany({ model, values });
      return {
        vectors: res.embeddings,
        tokens: res.usage.tokens,
        costMicros: costMicros(id, res.usage.tokens, 0),
      };
    },
  };
}
