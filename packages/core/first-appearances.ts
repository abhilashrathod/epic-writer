import type { ClientSession, Db } from 'mongodb';
import {
  documentVersions,
  readHeadByKey,
  readHeads,
  type DocumentDoc,
  type NarrativeRef,
} from '@epic/db';
import { classifyLines, extractScenes, findMarkers } from '@epic/fountain';
import { commitInSession, versionBody, type Change } from './commit';
import { loadNarrativeOrders } from './narrative-index';
import { placedRef, type NarrativeOrders } from './narrative-refs';
import type { ProjectContext } from './works';

type DocShape = Pick<DocumentDoc, 'key' | 'workKey' | 'orderPath' | 'format'>;

const pad = (n: number) => String(n).padStart(4, '0');

/**
 * Where each entry first appears in one document: the earliest keyed scene that mentions it
 * outside dialogue (Fountain) or anywhere (prose). Being named in dialogue is not appearing; that
 * gap is what the "name used too early" rule reports. Scene orders match `deriveScenes`.
 */
export function firstPresence(doc: DocShape, text: string): Map<string, NarrativeRef> {
  const lines = text.split('\n');
  const types = doc.format === 'fountain' ? classifyLines(lines) : null;
  const out = new Map<string, NarrativeRef>();
  extractScenes(text, doc.format).forEach((s, i) => {
    if (!s.key) return;
    const last = s.line + text.slice(s.from, s.to).split('\n').length - 1;
    for (let n = s.line; n <= last; n++) {
      const t = types?.[n];
      if (t === 'dialogue' || t === 'parenthetical') continue;
      for (const m of findMarkers(lines[n] ?? '')) {
        if (m.kind !== 'mention' || !m.key || out.has(m.key)) continue;
        out.set(m.key, {
          workKey: doc.workKey,
          documentKey: doc.key,
          sceneKey: s.key,
          order: `${doc.orderPath}.${pad(i + 1)}`,
        });
      }
    }
  });
  return out;
}

/** An entry's earliest appearance in `doc`'s work, searching every document except `doc`. */
async function firstElsewhere(
  db: Db,
  session: ClientSession,
  ctx: ProjectContext,
  entityKey: string,
  doc: DocShape,
): Promise<NarrativeRef | undefined> {
  const texts = await documentVersions.findWorkingContaining(
    db,
    { ...ctx.scope, needle: `[[@e:${entityKey}|` },
    { session },
  );
  let best: NarrativeRef | undefined;
  for (const w of texts) {
    if (w.documentKey === doc.key) continue;
    const other = await readHeadByKey(db, 'documents', ctx.scope, w.documentKey, { session });
    if (!other || other.kind !== 'text' || other.workKey !== doc.workKey) continue;
    const ref = firstPresence(other, w.text).get(entityKey);
    if (ref && (!best || ref.order < best.order)) best = ref;
  }
  return best;
}

// By key alone: a scene that only changed position is still the same first appearance.
const sameRef = (a?: NarrativeRef, b?: NarrativeRef) =>
  a?.documentKey === b?.documentKey && a?.sceneKey === b?.sceneKey;

/**
 * Keeps `entities.firstAppearances` right for `doc`'s work after its text changed, inside the
 * caller's transaction. Writes one automatic commit, only when something moved. Other documents
 * are read only when an entry's first appearance was in this document and is now gone from it.
 */
export async function updateFirstAppearances(
  db: Db,
  session: ClientSession,
  ctx: ProjectContext,
  doc: DocShape,
  text: string,
): Promise<void> {
  const found = firstPresence(doc, text);
  const heads = await readHeads(
    db,
    'entities',
    ctx.scope,
    {
      $or: [
        { key: { $in: [...found.keys()] } },
        { firstAppearances: { $elemMatch: { workKey: doc.workKey, documentKey: doc.key } } },
      ],
    },
    { session },
  );
  const changes: Change[] = [];
  let orders: NarrativeOrders | undefined;
  for (const e of heads) {
    const stored = e.firstAppearances.find((r) => r.workKey === doc.workKey);
    const here = found.get(e.key);
    let next: NarrativeRef | undefined;
    if (stored?.documentKey === doc.key) {
      // The stored one was the work's earliest, so other documents only come later than this one.
      next = here ?? (await firstElsewhere(db, session, ctx, e.key, doc));
    } else if (here && stored) {
      orders ??= await loadNarrativeOrders(db, ctx, session);
      next = here.order < placedRef(stored, orders).order ? here : stored;
    } else {
      next = here ?? stored;
    }
    if (sameRef(next, stored)) continue;
    const others = e.firstAppearances.filter((r) => r.workKey !== doc.workKey);
    changes.push({
      op: 'update',
      collection: 'entities',
      key: e.key,
      data: { ...versionBody(e), firstAppearances: next ? [...others, next] : others },
    });
  }
  if (!changes.length) return;
  await commitInSession(db, session, {
    ...ctx.scope,
    message: 'Update first appearances',
    author: { kind: 'user', userId: ctx.userId },
    auto: true,
    changes,
  });
}
