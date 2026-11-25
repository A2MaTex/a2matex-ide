import { AlertTriangle } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';
import type { AutomationFlowNode } from '@presentation/features/workflow-editor/react-flow-adapter';

export function AutomationNode({ data, dragging, selected }: NodeProps<AutomationFlowNode>) {
  const iconOnly = data.labelMode === 'icon';

  return (
    <div
      aria-label={data.displayName}
      role="group"
      data-dragging={dragging}
      data-has-issues={data.issueCount > 0}
      data-selected={selected}
      className={
        'workflow-node-card group relative cursor-grab touch-none select-none rounded-xl border ' +
        'active:cursor-grabbing ' +
        (iconOnly ? 'min-w-16 ' : 'min-w-40 ') +
        (dragging ? 'cursor-grabbing' : '')
      }
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 top-0 z-2 h-px bg-linear-to-r from-transparent via-primary/80 to-transparent"
      />
      {data.connectionInputs.map((port, index) => (
        <Handle
          key={port.name}
          id={port.name}
          type="target"
          position={Position.Left}
          style={{ top: 24 + index * 18 }}
          className="z-10! size-2.5! border-2! border-card! bg-slate-400! shadow-[0_0_7px_rgb(148_163_184_/_0.55)]"
          title={port.label}
        />
      ))}
      <div className="relative z-1 flex items-center gap-2.5 px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/12 text-cyan-300 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),0_0_18px_rgb(50_231_245_/_0.12)] transition-colors duration-150 group-hover:border-primary/40 group-hover:bg-primary/18">
          <NodeIcon icon={data.icon} className="size-4" />
        </span>
        {!iconOnly ? (
          <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[0.01em] text-card-foreground">
            {data.displayName}
          </div>
        ) : null}
        {data.issueCount > 0 ? (
          <span className="flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
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
          style={{
            top: `calc(50% + ${(index - (data.connectionOutputs.length - 1) / 2) * 18}px)`,
          }}
          className={
            'z-10! size-2.5! border-2! border-card! ' +
            (port.name === 'success'
              ? 'bg-emerald-400! shadow-[0_0_8px_rgb(52_211_153_/_0.65)]'
              : port.name === 'error'
                ? 'bg-red-400! shadow-[0_0_8px_rgb(248_113_113_/_0.65)]'
                : 'bg-primary! shadow-[0_0_8px_rgb(50_231_245_/_0.65)]')
          }
          title={port.label}
        />
      ))}
    </div>
  );
}
