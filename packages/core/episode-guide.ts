import type { Db } from 'mongodb';
import { readHeads } from '@epic/db';
import { NotFound } from './errors';
import { getTree, type ProjectContext } from './works';

/**
 * An episode or chapter guide for one work (WK-5), as Markdown: each container with its arc
 * summary, each episode or chapter with its logline, summary and key events, in reading order.
 */
export async function episodeGuide(
  db: Db,
  ctx: ProjectContext,
  workKey: string,
): Promise<{ title: string; markdown: string }> {
  const [{ works, documents }, entities] = await Promise.all([
    getTree(db, ctx),
    readHeads(db, 'entities', ctx.scope),
  ]);
  const work = works.find((w) => w.key === workKey);
  if (!work) throw new NotFound('Work not found');
  const names = new Map(
    entities.filter((e) => e.canonState !== 'scrapped').map((e) => [e.key, e.name]),
  );
  const unit = work.levels.at(-1)?.singular ?? 'Episode';
  const title = `${work.name}: ${unit.toLowerCase()} guide`;

  const out = [`# ${title}`];
  for (const d of documents) {
    if (d.workKey !== workKey) continue;
    const depth = d.orderPath.split('.').length;
    out.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${d.title}`);
    if (d.kind === 'container') {
      if (d.arcSummary) out.push(d.arcSummary);
      continue;
    }
    if (d.logline) out.push(`_${d.logline}_`);
    if (d.summary) out.push(d.summary);
    const events = d.keyEventKeys.flatMap((k) => names.get(k) ?? []);
    if (events.length) out.push(['Key events:', ...events.map((n) => `- ${n}`)].join('\n'));
  }
  return { title, markdown: `${out.join('\n\n')}\n` };
}
