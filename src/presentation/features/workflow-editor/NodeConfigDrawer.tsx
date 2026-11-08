import { useCallback, useEffect, useRef } from 'react';

import type { WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { cn } from '@shared/utils/cn';

import { NodeInspector } from '@presentation/features/workflow-editor/NodeInspector';

interface NodeConfigDrawerProps {
  open: boolean;
  catalog: readonly NodeDefinition[];
  node: WorkflowNode | null;
  issues: WorkflowIssue[];
  execute(command: WorkflowCommand): boolean;
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
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
  node,
  issues,
  execute,
  onDuplicate,
  onDelete,
  onClose,
}: NodeConfigDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const nodeId = node?.id;
  const close = useCallback(() => {
    onClose();
    scheduleFocusReturn(nodeId);
  }, [nodeId, onClose]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (drawerRef.current?.contains(event.target as globalThis.Node)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [close, open]);

  return (
    <aside
      ref={drawerRef}
      aria-hidden={!open}
      aria-label="Node configuration drawer"
      inert={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-30 w-[420px] max-w-[calc(100%-1.5rem)] border-l border-border bg-panel shadow-2xl transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
      )}
    >
      <NodeInspector
        catalog={catalog}
        node={node}
        issues={issues}
        execute={execute}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onClose={close}
      />
    </aside>
  );
}
