'use client';

import '@xyflow/react/dist/style.css';
import { Controls, ReactFlow, type Edge } from '@xyflow/react';
import type { ELK } from 'elkjs/lib/elk-api';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { EntityTypeDto } from '@epic/schemas/api';
import type { Graph } from '../../lib/graph';
import { EntryNode, type EntryFlowNode } from './EntryNode';

const W = 176;
const H = 56;
const nodeTypes = { entry: EntryNode };

// React Flow reads these variables; ours come from packages/ui/tokens.css so both skins apply.
const theme = {
  '--xy-background-color': 'var(--panel)',
  '--xy-edge-stroke': 'var(--faint)',
  '--xy-edge-stroke-selected': 'var(--ink)',
  '--xy-edge-label-color': 'var(--muted)',
  '--xy-edge-label-background-color': 'var(--panel)',
  '--xy-controls-button-background-color': 'var(--surface)',
  '--xy-controls-button-background-color-hover': 'var(--sunk)',
  '--xy-controls-button-color': 'var(--ink)',
  '--xy-controls-button-color-hover': 'var(--ink)',
  '--xy-controls-button-border-color': 'transparent',
  '--xy-controls-box-shadow': 'none',
  '--xy-attribution-background-color': 'transparent',
} as CSSProperties;

let elk: ELK | null = null;

/** Positions from elkjs' layered layout. Loaded on first use and run off the render path. */
async function layout(g: Graph, tree: boolean): Promise<Map<string, { x: number; y: number }>> {
  if (!elk) {
    const { default: Elk } = await import('elkjs/lib/elk.bundled.js');
    elk = new Elk();
  }
  const res = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': tree ? 'DOWN' : 'RIGHT',
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.nodeNodeBetweenLayers': tree ? '56' : '96',
    },
    children: g.nodes.map((n) => ({ id: n.key, width: W, height: H })),
    // Spouses and siblings don't rank a family tree; they share a generation instead.
    edges: g.edges
      .filter((e) => !(tree && e.symmetric))
      .map((e) => ({ id: e.key, sources: [e.from], targets: [e.to] })),
  });
  return new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
}

/**
 * Draws a graph with elkjs positions. `tree` lays generations top to bottom with spouses side by
 * side; otherwise left to right. Future links are dotted.
 */
export function GraphCanvas({
  graph,
  types,
  tree = false,
  selectedKey = null,
  onOpen,
  label,
  heightClass = 'h-[70vh] min-h-96',
}: {
  graph: Graph;
  types: EntityTypeDto[];
  tree?: boolean;
  selectedKey?: string | null;
  onOpen: (key: string) => void;
  label: string;
  /** Smaller on entry pages than on the graph page. */
  heightClass?: string;
}) {
  const [pos, setPos] = useState<{
    for: Graph;
    at: Map<string, { x: number; y: number }>;
    n: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    layout(graph, tree).then(
      (at) => live && setPos((p) => ({ for: graph, at, n: (p?.n ?? 0) + 1 })),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [graph, tree]);

  const at = pos?.for === graph ? pos.at : null;
  const flow = useMemo(() => {
    if (!at) return null;
    const typeOf = new Map(types.map((t) => [t.key, t]));
    const nodes: EntryFlowNode[] = graph.nodes.map((n) => {
      const t = typeOf.get(n.typeKey);
      return {
        id: n.key,
        type: 'entry',
        position: at.get(n.key) ?? { x: 0, y: 0 },
        data: {
          name: n.name,
          typeName: t?.name ?? 'Unknown type',
          icon: t?.icon ?? 'circle',
          color: t?.color ?? 'cat-8',
          life: n.life,
          selected: n.key === selectedKey,
        },
      };
    });
    const edges: Edge[] = graph.edges.map((e) => {
      const side = tree && e.symmetric;
      // Side links run left to right so the line doesn't cross either card.
      const flip = side && (at.get(e.from)?.x ?? 0) > (at.get(e.to)?.x ?? 0);
      return {
        id: e.key,
        source: flip ? e.to : e.from,
        target: flip ? e.from : e.to,
        sourceHandle: tree && !side ? 'b' : 'r',
        targetHandle: tree && !side ? 't' : 'l',
        type: side ? 'straight' : tree ? 'smoothstep' : 'default',
        label: e.label,
        className: e.future ? 'future' : undefined,
        style: e.future ? { strokeDasharray: '4 4' } : undefined,
        focusable: false,
      };
    });
    return { nodes, edges };
  }, [at, graph, types, tree, selectedKey]);

  if (error)
    return (
      <p role="alert" className="text-bad">
        Couldn’t lay out the graph: {error}
      </p>
    );
  if (!graph.nodes.length) return null;
  return (
    <div
      role="group"
      aria-label={label}
      style={theme}
      className={`${heightClass} overflow-hidden rounded-xl bg-panel`}
    >
      {flow ? (
        // A new layout remounts so the view fits the new graph.
        <ReactFlow
          key={pos?.n}
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => onOpen(n.id)}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.2}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      ) : (
        <p className="p-6 text-muted">Laying out…</p>
      )}
    </div>
  );
}
