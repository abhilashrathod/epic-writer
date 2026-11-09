import type { Db } from 'mongodb';
import { readHeads, scenes } from '@epic/db';
import type { AsOf } from './asof';
import type { ProjectContext } from './works';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Where each episode title, scene heading and order path falls in a work. */
export async function narrativePoints(
  db: Db,
  ctx: ProjectContext,
  workKey: string,
): Promise<Map<string, string[]>> {
  const documents = await readHeads(db, 'documents', ctx.scope, { workKey });
  const rows = (
    await Promise.all(
      documents.map((d) => scenes.listForDocument(db, { ...ctx.scope, documentKey: d.key })),
    )
  ).flat();
  const points = new Map<string, string[]>();
  const add = (label: string | null | undefined, order: string) => {
    if (!label?.trim()) return;
    const key = norm(label);
    points.set(key, [...(points.get(key) ?? []), order]);
  };
  for (const d of documents) {
    add(d.title, d.orderPath);
    add(d.orderPath, d.orderPath);
  }
  for (const s of rows) add(s.heading, s.order);
  return points;
}

/**
 * Whether a narrative-reference item may be shown as of a point. These fields are free text, so an
 * item must name a place in the work; one that can't be placed could be a spoiler and stays out.
 * A label used more than once counts at its latest place, for the same reason.
 */
export function narrativeRefFilter(
  points: Map<string, string[]>,
  asOf: AsOf,
): (item: string) => boolean {
  return (item) => {
    if (!asOf.workKey || asOf.order === null) return true;
    const orders = points.get(norm(item));
    return !!orders && orders.reduce((a, b) => (a > b ? a : b)) <= asOf.order;
  };
}
