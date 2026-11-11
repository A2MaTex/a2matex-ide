import { useCallback, useEffect, useRef } from 'react';

import type { WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { cn } from '@shared/utils/cn';

import { NodeConfigurationInspector } from '@presentation/features/workflow-editor/NodeConfigurationInspector';
import { useEditorStore } from '@presentation/stores/editor-store';

interface NodeConfigDrawerProps {
  open: boolean;
  catalog: readonly NodeDefinition[];
  node: WorkflowNode | null;
  revision: number;
  issues: WorkflowIssue[];
  execute(command: WorkflowCommand): boolean;
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
  node,
  revision,
  issues,
  execute,
  onDuplicate,
  onDelete,
  onClose,
  onPendingChange,
}: NodeConfigDrawerProps) {
  const helpTarget = useEditorStore((state) => state.helpTarget);
  const drawerRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (helpTarget) return;
      const target = event.target;
      if (drawerRef.current?.contains(target as globalThis.Node)) return;
      if (target instanceof Element && target.closest('[data-android-inspector-panel]')) return;
      if (!close()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (helpTarget) return;
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
  }, [close, helpTarget, open]);

  useEffect(() => () => onPendingChange(null), [onPendingChange]);

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
      {open ? (
        <NodeConfigurationInspector
          catalog={catalog}
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
