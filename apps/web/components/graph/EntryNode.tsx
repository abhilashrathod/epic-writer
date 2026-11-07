'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Icon, TYPE_TEXT, focusRing } from '@epic/ui';
import type { Life } from '../../lib/graph';

export type EntryNodeData = {
  name: string;
  typeName: string;
  icon: string;
  color: string;
  life: Life;
  selected: boolean;
};

export type EntryFlowNode = Node<EntryNodeData, 'entry'>;

// Invisible anchors: edges attach top/bottom in trees and left/right in webs and for spouses.
const hidden = '!h-px !min-h-0 !w-px !min-w-0 !border-0 !bg-transparent';

/** One entry on the canvas: a small card button. Unborn entries fade; the dead are marked. */
export function EntryNode({ data }: NodeProps<EntryFlowNode>) {
  const { name, typeName, icon, color, life, selected } = data;
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} className={hidden} />
      <Handle id="l" type="target" position={Position.Left} className={hidden} />
      <button
        // The click (mouse or keyboard) bubbles to React Flow's onNodeClick.
        type="button"
        data-life={life}
        aria-label={`${name}, ${typeName}${life === 'alive' ? '' : `, ${life}`}`}
        className={`nopan flex h-14 w-44 flex-col justify-center rounded-lg px-3 text-left text-sm ${focusRing} ${selected ? 'bg-selected text-on-selected' : 'bg-surface text-ink hover:bg-sunk'} ${life === 'unborn' ? 'opacity-40' : ''}`}
      >
        <span className="flex items-center gap-1.5">
          <Icon name={icon} className={`shrink-0 ${selected ? '' : TYPE_TEXT[color]}`} />
          <span className="truncate font-medium">{name}</span>
        </span>
        <span className={`truncate text-xs ${selected ? 'opacity-80' : 'text-muted'}`}>
          {typeName}
          {life !== 'alive' && ` · ${life}`}
        </span>
      </button>
      <Handle id="b" type="source" position={Position.Bottom} className={hidden} />
      <Handle id="r" type="source" position={Position.Right} className={hidden} />
    </>
  );
}
