import { AlertTriangle, Check, Loader2, Plus, X } from 'lucide-react';
import { useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { RunOverlayContext } from '@presentation/features/test-run/run-overlay';
import { AddAfterContext } from '@presentation/features/workflow-editor/add-after-context';
import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';
import type { AutomationFlowNode } from '@presentation/features/workflow-editor/react-flow-adapter';

export function AutomationNode({ id, data, dragging, selected }: NodeProps<AutomationFlowNode>) {
  const iconOnly = data.labelMode === 'icon';
  const addAfter = useContext(AddAfterContext);
  const run = useContext(RunOverlayContext);
  const runStatus = run ? (run.statusFor(id)?.status ?? 'idle') : undefined;
  const perDevice = run?.byNode.get(id) ?? [];
  const counts = {
    succeeded: perDevice.filter((entry) => entry.status === 'succeeded').length,
    failed: perDevice.filter((entry) => entry.status === 'failed').length,
    running: perDevice.filter((entry) => entry.status === 'running').length,
  };

  return (
    <div
      aria-label={data.displayName}
      role="group"
      data-dragging={dragging}
      data-has-issues={data.issueCount > 0}
      data-selected={selected}
      data-category={data.nodeType.split('.')[0]}
      data-node-type={data.nodeType}
      data-run-status={runStatus}
      data-label-mode={data.labelMode}
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
        <span className="node-icon grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/12 text-cyan-300 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),0_0_18px_rgb(50_231_245_/_0.12)] transition-colors duration-150 group-hover:border-primary/40 group-hover:bg-primary/18">
          <NodeIcon icon={data.icon} className="size-4" />
        </span>
        {!iconOnly ? (
          <div className="node-label min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[0.01em] text-card-foreground">
            {data.displayName}
          </div>
        ) : null}
        {data.issueCount > 0 ? (
          <span className="node-issues flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
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
      {runStatus === 'succeeded' ? (
        <span className="node-run-mark" data-kind="succeeded" aria-label="Succeeded on this device">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : runStatus === 'failed' ? (
        <span className="node-run-mark" data-kind="failed" aria-label="Failed on this device">
          <X className="size-3.5" strokeWidth={3} />
        </span>
      ) : runStatus === 'running' ? (
        <span className="node-run-mark" data-kind="running" aria-label="Running on this device">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      ) : null}
      {run && run.devices.length > 1 && perDevice.length > 0 ? (
        <span
          className="node-run-summary"
          title={perDevice
            .map(
              (entry) =>
                `${entry.adbSerial}: ${entry.status}${
                  entry.attempts > 1 ? ` (${entry.attempts} attempts)` : ''
                }${entry.errorMessage ? ` — ${entry.errorMessage}` : ''}`,
            )
            .join('\n')}
        >
          {counts.succeeded > 0 ? <span data-kind="succeeded">✓{counts.succeeded}</span> : null}
          {counts.failed > 0 ? <span data-kind="failed">✗{counts.failed}</span> : null}
          {counts.running > 0 ? <span data-kind="running">●{counts.running}</span> : null}
          <span data-kind="total">/{run.devices.length}</span>
        </span>
      ) : null}
      {addAfter
        ? data.connectionOutputs.map((port, index) =>
            data.connectedOutputs.includes(port.name) ? null : (
              <div
                key={`add-${port.name}`}
                className="node-add-stub nodrag nopan"
                data-port={port.name}
                style={{
                  top: `calc(50% + ${(index - (data.connectionOutputs.length - 1) / 2) * 18}px)`,
                }}
              >
                <span className="node-add-stub-line" aria-hidden="true" />
                <button
                  type="button"
                  className="node-add-stub-button"
                  aria-label={`Add node after ${data.displayName}${
                    data.connectionOutputs.length > 1 ? ` (${port.label})` : ''
                  }`}
                  title={
                    data.connectionOutputs.length > 1 ? `Add node · ${port.label}` : 'Add node'
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    addAfter(id, port.name, event.currentTarget.getBoundingClientRect());
                  }}
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ),
          )
        : null}
    </div>
  );
}
