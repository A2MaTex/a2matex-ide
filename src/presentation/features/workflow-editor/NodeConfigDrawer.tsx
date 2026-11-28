import { useCallback, useEffect, useRef } from 'react';

import type { WorkflowDocument, WorkflowNode } from '@domain/project/project';
import type { JsonValue } from '@shared/types/json-value';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { cn } from '@shared/utils/cn';

import { NodeConfigurationInspector } from '@presentation/features/workflow-editor/NodeConfigurationInspector';

interface NodeConfigDrawerProps {
  open: boolean;
  catalog: readonly NodeDefinition[];
  workflow: WorkflowDocument;
  workflowInputSchema: JsonValue;
  node: WorkflowNode | null;
  revision: number;
  issues: WorkflowIssue[];
  execute(command: WorkflowCommand, inputSchema?: JsonValue): boolean;
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
  onPendingChange(nodeId: string | null): void;
}

function returnFocusToNode(nodeId: string | undefined) {
  if (!nodeId) return;
  const node = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find(
    (candidate) => candidate.dataset.id === nodeId,
  );
  node?.focus();
}

function scheduleFocusReturn(nodeId: string | undefined) {
  const schedule =
    window.requestAnimationFrame ??
    ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
  schedule(() => returnFocusToNode(nodeId));
}

export function NodeConfigDrawer({
  open,
  catalog,
  workflow,
  workflowInputSchema,
  node,
  revision,
  issues,
  execute,
  onDuplicate,
  onDelete,
  onClose,
  onPendingChange,
}: NodeConfigDrawerProps) {
  const dirtyNodeIdRef = useRef<string | null>(null);
  const nodeId = node?.id;
  const close = useCallback(() => {
    if (dirtyNodeIdRef.current && !window.confirm('Discard unsaved node configuration changes?')) {
      return false;
    }
    dirtyNodeIdRef.current = null;
    onPendingChange(null);
    onClose();
    scheduleFocusReturn(nodeId);
    return true;
  }, [nodeId, onClose, onPendingChange]);

  const setPending = useCallback(
    (pendingNodeId: string | null) => {
      dirtyNodeIdRef.current = pendingNodeId;
      onPendingChange(pendingNodeId);
    },
    [onPendingChange],
  );

  useEffect(() => () => onPendingChange(null), [onPendingChange]);

  return (
    <aside
      aria-hidden={!open}
      aria-label="Node configuration drawer"
      inert={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-30 w-108 max-w-[calc(100%-1rem)] border-l border-border bg-panel shadow-[-18px_0_50px_-30px_rgba(0,0,0,0.8)] transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
      )}
    >
      {open ? (
        <NodeConfigurationInspector
          catalog={catalog}
          workflow={workflow}
          workflowInputSchema={workflowInputSchema}
          node={node}
          revision={revision}
          issues={issues}
          execute={execute}
          onDirtyChange={setPending}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onClose={close}
        />
      ) : null}
    </aside>
  );
}
