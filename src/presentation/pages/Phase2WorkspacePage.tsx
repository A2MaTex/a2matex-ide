import {
  ChevronRight,
  CirclePlay,
  FileJson2,
  Folder,
  Redo2,
  Save,
  SaveAll,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import { validateWorkflow } from '@domain/workflow/workflow-validator';
import { Button } from '@presentation/components/ui/button';
import { useProjectCloseGuard } from '@presentation/features/project-session/use-project-close-guard';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';
import { NodeInspector } from '@presentation/features/workflow-editor/NodeInspector';
import { NodePalette } from '@presentation/features/workflow-editor/NodePalette';
import { ProblemsPanel } from '@presentation/features/workflow-editor/ProblemsPanel';
import { WorkflowCanvas } from '@presentation/features/workflow-editor/WorkflowCanvas';
import { useEditorStore } from '@presentation/stores/editor-store';
import { projectStoreIsDirty } from '@presentation/stores/project-store';

function ResizeHandle({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      className={
        orientation === 'horizontal'
          ? 'w-px bg-border outline-none data-[separator=hover]:bg-primary data-[separator=active]:bg-primary'
          : 'h-px bg-border outline-none data-[separator=hover]:bg-primary data-[separator=active]:bg-primary'
      }
    />
  );
}

function isTextInput(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function newNodeId(type: string) {
  return type.replace(/[^a-z0-9]+/gi, '-') + '-' + crypto.randomUUID().slice(0, 8);
}

export function Phase2WorkspacePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const session = useProjectStore((state) => state.session);
  const status = useProjectStore((state) => state.status);
  const error = useProjectStore((state) => state.error);
  const undoStack = useProjectStore((state) => state.undoStack);
  const redoStack = useProjectStore((state) => state.redoStack);
  const dirty = useProjectStore(projectStoreIsDirty);
  const save = useProjectStore((state) => state.save);
  const saveAs = useProjectStore((state) => state.saveAs);
  const close = useProjectStore((state) => state.close);
  const executeWorkflowCommand = useProjectStore((state) => state.executeWorkflowCommand);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const copiedNodeId = useEditorStore((state) => state.copiedNodeId);
  const selectNode = useEditorStore((state) => state.selectNode);
  const copyNode = useEditorStore((state) => state.copyNode);
  const resetWorkflowSession = useEditorStore((state) => state.resetWorkflowSession);
  useProjectCloseGuard(dirty);

  const document = session?.snapshot.document;
  const workflowPath = document?.manifest.entryWorkflow ?? '';
  const workflow = document?.workflows[workflowPath];
  const permissionIds = useMemo(
    () => document?.manifest.permissions.map((permission) => permission.id) ?? [],
    [document?.manifest.permissions],
  );
  const issues = useMemo(
    () => (workflow ? validateWorkflow(workflow, undefined, permissionIds) : []),
    [permissionIds, workflow],
  );
  const execute = useCallback(
    (command: WorkflowCommand) =>
      workflowPath ? executeWorkflowCommand(workflowPath, command) : false,
    [executeWorkflowCommand, workflowPath],
  );

  const duplicateNode = useCallback(
    (sourceNodeId: string) => {
      const nodeId = newNodeId('copy');
      if (
        execute({
          type: 'node.duplicate',
          payload: { sourceNodeId, nodeId },
        })
      ) {
        selectNode(nodeId);
      }
    },
    [execute, selectNode],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        if (session && status !== 'saving') void save();
        return;
      }
      if (isTextInput(event.target)) return;
      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && key === 'y') {
        event.preventDefault();
        redo();
      } else if (modifier && key === 'c' && selectedNodeId) {
        event.preventDefault();
        copyNode(selectedNodeId);
      } else if (modifier && key === 'v' && copiedNodeId) {
        event.preventDefault();
        duplicateNode(copiedNodeId);
      } else if (modifier && key === 'd' && selectedNodeId) {
        event.preventDefault();
        duplicateNode(selectedNodeId);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
        event.preventDefault();
        execute({ type: 'node.remove', payload: { nodeId: selectedNodeId } });
        selectNode(null);
      } else if (event.key === '/') {
        event.preventDefault();
        globalThis.document.getElementById('node-palette-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    copiedNodeId,
    copyNode,
    document,
    duplicateNode,
    execute,
    redo,
    save,
    selectNode,
    selectedNodeId,
    session,
    status,
    undo,
  ]);

  useEffect(() => {
    return () => resetWorkflowSession();
  }, [resetWorkflowSession]);

  if (!session || !document || !workflow || document.manifest.projectId !== projectId) {
    return (
      <div className="grid h-full place-items-center bg-editor-canvas p-8 text-center">
        <div className="max-w-md rounded-xl border border-border bg-card p-7 shadow-xl">
          <Folder className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">No project is loaded</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Open or create a project before entering its workspace.
          </p>
          <Button className="mt-5" onClick={() => navigate('/projects')}>
            Go to projects
          </Button>
        </div>
      </div>
    );
  }

  const { manifest } = document;
  const saving = status === 'saving';
  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const closeProject = () => {
    if (dirty && !window.confirm('Close this project and discard unsaved changes?')) return;
    resetWorkflowSession();
    close();
    navigate('/projects');
  };
  const addFromPalette = (definition: NodeDefinition) => {
    const nodeId = newNodeId(definition.type);
    const index = workflow.nodes.length;
    if (
      execute({
        type: 'node.add',
        payload: {
          nodeId,
          nodeType: definition.type,
          nodeVersion: definition.version,
          position: { x: 80 + (index % 3) * 230, y: 80 + Math.floor(index / 3) * 150 },
        },
      })
    ) {
      selectNode(nodeId);
    }
  };

  return (
    <div className="flex h-full min-h-130 flex-col overflow-hidden bg-editor-canvas">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="hover:text-foreground"
          >
            Projects
          </button>
          <ChevronRight className="size-3" />
          <span className="truncate font-medium text-foreground">{manifest.name}</span>
          <span
            className={
              'ml-2 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ' +
              (dirty ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')
            }
          >
            {dirty ? 'unsaved' : 'saved'}
          </span>
          <span className="ml-2 text-[10px]">
            {workflow.nodes.length} nodes · {issues.length} problems
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={undo} disabled={undoStack.length === 0}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={redo} disabled={redoStack.length === 0}>
            <Redo2 /> Redo
          </Button>
          <Button size="sm" variant="ghost" onClick={closeProject}>
            <X /> Close
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void saveAs()} disabled={saving}>
            <SaveAll /> Save As
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            <Save /> {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" disabled title="Runtime integration begins in Phase 4">
            <CirclePlay /> Run
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Group className="min-h-0 flex-1" orientation="vertical">
        <Panel defaultSize="72%" minSize="42%">
          <Group className="h-full" orientation="horizontal">
            <Panel defaultSize="21%" minSize="16%" maxSize="32%">
              <aside
                className="h-full overflow-y-auto bg-panel"
                aria-label="Project explorer and node palette"
              >
                <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Folder className="size-3.5" /> Explorer
                </div>
                <div className="p-2 text-[11px]">
                  <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-secondary-foreground">
                    <FileJson2 className="size-3.5 text-primary" /> a2matex.project.json
                  </div>
                  <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-secondary-foreground">
                    <ChevronRight className="size-3" />
                    <Folder className="size-3.5 text-primary" /> workflows
                  </div>
                  <div className="ml-5 flex items-center gap-1.5 rounded bg-accent px-1.5 py-1">
                    <FileJson2 className="size-3.5 text-warning" />
                    {workflowPath.split('/').at(-1)}
                  </div>
                </div>
                <NodePalette onAdd={addFromPalette} />
              </aside>
            </Panel>
            <ResizeHandle orientation="horizontal" />
            <Panel defaultSize="57%" minSize="34%">
              <section
                className="flex h-full flex-col bg-editor-canvas"
                aria-label="Workflow canvas"
              >
                <div className="flex h-9 shrink-0 items-center border-b border-border bg-panel/80 px-3 text-xs">
                  <span className="border-b-2 border-primary px-2 py-2.5 font-medium">
                    {workflow.name}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <ReactFlowProvider>
                    <WorkflowCanvas workflow={workflow} issues={issues} execute={execute} />
                  </ReactFlowProvider>
                </div>
              </section>
            </Panel>
            <ResizeHandle orientation="horizontal" />
            <Panel defaultSize="22%" minSize="18%" maxSize="36%">
              <NodeInspector
                node={selectedNode}
                issues={issues}
                execute={execute}
                onDuplicate={() => selectedNode && duplicateNode(selectedNode.id)}
                onDelete={() => {
                  if (!selectedNode) return;
                  execute({ type: 'node.remove', payload: { nodeId: selectedNode.id } });
                  selectNode(null);
                }}
              />
            </Panel>
          </Group>
        </Panel>
        <ResizeHandle orientation="vertical" />
        <Panel defaultSize="28%" minSize="16%" maxSize="48%">
          <ProblemsPanel
            issues={issues}
            revision={session.workingRevision}
            savedRevision={session.savedRevision}
          />
        </Panel>
      </Group>
    </div>
  );
}
