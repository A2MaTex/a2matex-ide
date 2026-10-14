import { AlertTriangle } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { NodeIcon } from './node-icons';
import type { AutomationFlowNode } from './react-flow-adapter';

export function AutomationNode({ data, selected }: NodeProps<AutomationFlowNode>) {
  return (
    <div
      className={
        'min-w-44 rounded-lg border bg-card shadow-xl transition-shadow ' +
        (selected
          ? 'border-primary shadow-primary/10'
          : data.issueCount > 0
            ? 'border-destructive/70'
            : 'border-border')
      }
    >
      {data.inputs.map((port, index) => (
        <Handle
          key={port.name}
          id={port.name}
          type="target"
          position={Position.Left}
          style={{ top: 43 + index * 18 }}
          className="size-2.5! border-2! border-card! bg-muted-foreground!"
          title={port.label}
        />
      ))}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          <NodeIcon icon={data.icon} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{data.displayName}</div>
          <div className="truncate font-mono text-[9px] text-muted-foreground">
            {data.nodeType}@{data.nodeVersion}
          </div>
        </div>
        {data.issueCount > 0 ? (
          <span className="flex items-center gap-1 text-[9px] text-destructive">
            <AlertTriangle className="size-3" /> {data.issueCount}
          </span>
        ) : null}
      </div>
      <div className="px-3 py-2 text-[10px] text-muted-foreground">
        {data.inputs.length} input · {data.outputs.length} output
      </div>
      {data.outputs.map((port, index) => (
        <Handle
          key={port.name}
          id={port.name}
          type="source"
          position={Position.Right}
          style={{ top: 43 + index * 18 }}
          className="size-2.5! border-2! border-card! bg-primary!"
          title={port.label}
        />
      ))}
    </div>
  );
}
