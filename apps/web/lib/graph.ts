// Pure graph building for the family tree, relationship web and lineage views (GR-1, 2, 3).
// Everything resolves "as of" through @epic/core/asof so the graph agrees with every other view.

import { lifeFields, lifeStatus, resolveFields, timedStatus, type AsOf } from '@epic/core/asof';
import type { StoryTimeShape } from '@epic/core/calendar';
import type { EntityTypeDto, LinkDto, LinkTypeDto, WorldDto } from '@epic/schemas/api';

export type Life = 'unborn' | 'alive' | 'dead';

export interface GraphNode {
  key: string;
  name: string;
  typeKey: string;
  life: Life;
}

export interface GraphEdge {
  key: string;
  from: string;
  to: string;
  kind: LinkDto['kind'];
  label: string;
  /** Exists but hasn't happened or been revealed as of now: drawn dotted. */
  future: boolean;
  /** Symmetric links (spouses, siblings) read the same both ways, so they don't rank a hierarchy. */
  symmetric: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphContext {
  world: WorldDto;
  types: EntityTypeDto[];
  linkTypes: LinkTypeDto[];
  asOf: AsOf;
}

function asStoryTime(v: unknown): StoryTimeShape | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Partial<StoryTimeShape>;
  return typeof t.start === 'number' && typeof t.precision === 'string'
    ? (v as StoryTimeShape)
    : null;
}

/**
 * Whether a `born` entry is unborn, alive or dead as of now; entries without the trait are alive.
 * `facts` are this entry's own facts.
 */
export function lifeOf(
  entity: WorldDto['entities'][number],
  type: EntityTypeDto | undefined,
  facts: WorldDto['facts'],
  asOf: AsOf,
): Life {
  if (!type?.traits.includes('born')) return 'alive';
  const { born, died } = lifeFields(type.fields);
  const fields = resolveFields(entity.fields, facts, asOf);
  return lifeStatus(
    born ? asStoryTime(fields[born]) : null,
    died ? asStoryTime(fields[died]) : null,
    asOf.storyTime,
  );
}

/** Every non-scrapped entry and link as nodes and edges, before any view's filtering. */
export function buildGraph(ctx: GraphContext): Graph {
  const typeOf = new Map(ctx.types.map((t) => [t.key, t]));
  const linkTypeOf = new Map(ctx.linkTypes.map((t) => [t.key, t]));
  const factsOf = new Map<string, WorldDto['facts']>();
  for (const f of ctx.world.facts) {
    const list = factsOf.get(f.entityKey);
    if (list) list.push(f);
    else factsOf.set(f.entityKey, [f]);
  }
  const nodes = ctx.world.entities
    .filter((e) => e.canonState !== 'scrapped')
    .map((e) => ({
      key: e.key,
      name: e.name,
      typeKey: e.typeKey,
      life: lifeOf(e, typeOf.get(e.typeKey), factsOf.get(e.key) ?? [], ctx.asOf),
    }));
  const live = new Set(nodes.map((n) => n.key));
  const edges: GraphEdge[] = [];
  for (const l of ctx.world.links) {
    const status = timedStatus(l, ctx.asOf);
    if (status === 'scrapped' || !live.has(l.fromKey) || !live.has(l.toKey)) continue;
    const lt = linkTypeOf.get(l.typeKey);
    edges.push({
      key: l.key,
      from: l.fromKey,
      to: l.toKey,
      kind: l.kind,
      label: lt?.label ?? l.kind,
      future: status === 'future',
      symmetric: lt?.symmetric ?? false,
    });
  }
  return { nodes, edges };
}

/** Keeps only these nodes and the edges between them. */
function induced(g: Graph, keep: Set<string>, edge: (e: GraphEdge) => boolean = () => true): Graph {
  return {
    nodes: g.nodes.filter((n) => keep.has(n.key)),
    edges: g.edges.filter((e) => keep.has(e.from) && keep.has(e.to) && edge(e)),
  };
}

/** Tree picker options: entries of `institution` types that have members. */
export function treeOptions(types: EntityTypeDto[], g: Graph): { key: string; name: string }[] {
  const institutions = new Set(
    types.filter((t) => t.traits.includes('institution')).map((t) => t.key),
  );
  const withMembers = new Set(
    g.edges.filter((e) => e.kind === 'membership' && !e.future).flatMap((e) => [e.from, e.to]),
  );
  return g.nodes
    .filter((n) => institutions.has(n.typeKey) && withMembers.has(n.key))
    .map((n) => ({ key: n.key, name: n.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A family tree: the members of `institutionKey` (or, with null, everyone with a family link) and
 * the family links between them. Future family links are hidden so secret parentage stays secret.
 */
export function familyTree(g: Graph, institutionKey: string | null): Graph {
  const members = new Set<string>();
  for (const e of g.edges) {
    if (e.future) continue;
    if (institutionKey === null) {
      if (e.kind === 'kinship') members.add(e.from).add(e.to);
    } else if (e.kind === 'membership') {
      if (e.to === institutionKey) members.add(e.from);
      else if (e.from === institutionKey) members.add(e.to);
    }
  }
  return induced(g, members, (e) => e.kind === 'kinship' && !e.future);
}

/** The relationship web, narrowed to these entry types and link kinds. */
export function relationshipWeb(g: Graph, typeKeys: Set<string>, kinds: Set<string>): Graph {
  const keep = new Set(g.nodes.filter((n) => typeKeys.has(n.typeKey)).map((n) => n.key));
  return induced(g, keep, (e) => kinds.has(e.kind));
}

/** One entry and everything within `hops` links of it, in either direction. */
export function lineage(g: Graph, rootKey: string, hops: number): Graph {
  if (!g.nodes.some((n) => n.key === rootKey)) return { nodes: [], edges: [] };
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    for (const [a, b] of [
      [e.from, e.to],
      [e.to, e.from],
    ] as const) {
      const list = adj.get(a);
      if (list) list.push(b);
      else adj.set(a, [b]);
    }
  }
  const seen = new Set([rootKey]);
  let frontier = [rootKey];
  for (let i = 0; i < hops && frontier.length; i++) {
    const next: string[] = [];
    for (const k of frontier)
      for (const o of adj.get(k) ?? [])
        if (!seen.has(o)) {
          seen.add(o);
          next.push(o);
        }
    frontier = next;
  }
  return induced(g, seen);
}
