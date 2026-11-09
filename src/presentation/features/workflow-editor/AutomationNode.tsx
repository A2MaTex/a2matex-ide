import { AlertTriangle, CircleOff } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';
import type { AutomationFlowNode } from '@presentation/features/workflow-editor/react-flow-adapter';

export function AutomationNode({ data, selected }: NodeProps<AutomationFlowNode>) {
  const iconOnly = data.labelMode === 'icon';

  return (
    <div
      aria-label={data.displayName + (data.disabled ? ', disabled' : '')}
      aria-disabled={data.disabled}
      role="group"
      className={
        'group relative rounded-lg border bg-card shadow-xl transition-all ' +
        (iconOnly ? 'min-w-16 ' : 'min-w-40 ') +
        (data.disabled ? 'opacity-55 grayscale ' : '') +
        (selected
          ? 'border-primary shadow-primary/10'
          : data.issueCount > 0
            ? 'border-destructive/70'
            : 'border-border')
      }
    >
      {data.connectionInputs.map((port, index) => (
        <Handle
          key={port.name}
          id={port.name}
          type="target"
          position={Position.Left}
          style={{ top: 24 + index * 18 }}
          className="size-2.5! border-2! border-card! bg-muted-foreground!"
          title={port.label}
        />
      ))}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-cyan-400">
          <NodeIcon icon={data.icon} className="size-3.5" />
        </span>
        {!iconOnly ? (
          <div className="min-w-0 flex-1 truncate text-xs font-semibold">{data.displayName}</div>
        ) : null}
        {data.disabled ? (
          <span className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <CircleOff className="size-2.5" /> {!iconOnly ? 'Disabled' : null}
          </span>
        ) : null}
        {data.issueCount > 0 ? (
          <span className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertTriangle className="size-3" /> {data.issueCount}
          </span>
        ) : null}
      </div>
      {data.connectionOutputs.map((port, index) => (
        <Handle
          key={port.name}
          id={port.name}
          type="source"
          position={Position.Right}
          style={{ top: 24 + index * 18 }}
          className="size-2.5! border-2! border-card! bg-primary!"
          title={port.label}
        />
      ))}
    </div>
  );
}
