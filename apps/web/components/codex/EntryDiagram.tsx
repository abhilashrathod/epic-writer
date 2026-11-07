'use client';

import { useMemo } from 'react';
import type { AsOf } from '@epic/core/asof';
import type { EntityDto, EntityTypeDto, LinkTypeDto, WorldDto } from '@epic/schemas/api';
import { buildGraph, familyTree, lineage } from '../../lib/graph';
import { GraphCanvas } from '../graph/GraphCanvas';

/**
 * Diagrams on an entry page: an institution's family tree (CX-8) and, for places and
 * institutions, a diagram of everything one link away (CX-9). Driven by traits.
 */
export function EntryDiagram(props: {
  entry: EntityDto;
  type: EntityTypeDto;
  world: WorldDto;
  types: EntityTypeDto[];
  linkTypes: LinkTypeDto[];
  asOf: AsOf;
  onOpen: (key: string) => void;
}) {
  const { entry, type, world, types, linkTypes, asOf } = props;
  const institution = type.traits.includes('institution');
  const full = useMemo(
    () => buildGraph({ world, types, linkTypes, asOf }),
    [world, types, linkTypes, asOf],
  );
  const tree = useMemo(
    () => (institution ? familyTree(full, entry.key) : null),
    [institution, full, entry.key],
  );
  const near = useMemo(() => lineage(full, entry.key, 1), [full, entry.key]);

  return (
    <>
      {tree && tree.nodes.length > 0 && (
        <section aria-label="Family tree" className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">Family tree</h3>
          <GraphCanvas
            graph={tree}
            types={types}
            tree
            onOpen={props.onOpen}
            label={`Family tree of ${entry.name}`}
            heightClass="h-96"
          />
        </section>
      )}
      {near.edges.length > 0 && (
        <section aria-label="Connection diagram" className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">Connections</h3>
          <GraphCanvas
            graph={near}
            types={types}
            selectedKey={entry.key}
            onOpen={props.onOpen}
            label={`Connections of ${entry.name}`}
            heightClass="h-80"
          />
        </section>
      )}
    </>
  );
}
