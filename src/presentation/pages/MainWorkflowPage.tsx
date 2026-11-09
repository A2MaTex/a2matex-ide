import {
  ChevronDown,
  ChevronRight,
  CirclePlay,
  CloudDownload,
  CloudUpload,
  Copy,
  Folder,
  Network,
  Plus,
  Redo2,
  Save,
  SaveAll,
  Scissors,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

import { toWorkflowNodeCatalog } from '@application/node-catalog/to-workflow-node-catalog';
import {
  androidSelectorToJsonValue,
  getAndroidSelectorTargets,
} from '@domain/android-inspector/android-selector';
import { DEFAULT_NODE_CATALOG_RUNTIME_VERSION } from '@domain/node-catalog/node-catalog';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import { validateWorkflow } from '@domain/workflow/workflow-validator';
import { Button } from '@presentation/components/ui/button';
import { AndroidInspectorPanel } from '@presentation/features/android-inspector/AndroidInspectorPanel';
import { useProjectCloseGuard } from '@presentation/features/project-session/use-project-close-guard';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';
import { NodeConfigDrawer } from '@presentation/features/workflow-editor/NodeConfigDrawer';
import { NodeDetailDialog } from '@presentation/features/workflow-editor/NodeDetailDialog';
import { NodeHelpDialog } from '@presentation/features/workflow-editor/NodeHelpDialog';
import { NodePalette } from '@presentation/features/workflow-editor/NodePalette';
import { ProblemsPanel } from '@presentation/features/workflow-editor/ProblemsPanel';
import { WorkflowCanvas } from '@presentation/features/workflow-editor/WorkflowCanvas';
import {
  WorkflowActionList,
  type WorkflowAction,
} from '@presentation/features/workflow-editor/WorkflowActionList';
import { WorkflowExplorer } from '@presentation/features/workflow-editor/WorkflowExplorer';
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

function SidebarResizeHandle() {
  return (
    <Separator
      aria-label="Resize Explorer and Node Palette"
      className="h-px cursor-row-resize bg-border outline-none transition-colors data-[separator=active]:bg-primary data-[separator=hover]:bg-primary"
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
  void type;
  return crypto.randomUUID();
}

export function MainWorkflowPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const session = useProjectStore((state) => state.session);
  const status = useProjectStore((state) => state.status);
  const error = useProjectStore((state) => state.error);
  const undoStack = useProjectStore((state) => state.undoStack);
  const redoStack = useProjectStore((state) => state.redoStack);
  const dirty = useProjectStore(projectStoreIsDirty);
  const localSaveStatus = useProjectStore((state) => state.localSaveStatus);
  const open = useProjectStore((state) => state.open);
  const flushLocalSave = useProjectStore((state) => state.flushLocalSave);
  const exportProject = useProjectStore((state) => state.exportProject);
  const syncCloud = useProjectStore((state) => state.syncCloud);
  const updateFromCloud = useProjectStore((state) => state.updateFromCloud);
  const cloudStatus = useProjectStore((state) => state.cloudStatus);
  const cloudAvailable = useProjectStore((state) => state.cloudAvailable);
  const cloudError = useProjectStore((state) => state.cloudError);
  const close = useProjectStore((state) => state.close);
  const discard = useProjectStore((state) => state.discard);
  const executeWorkflowCommand = useProjectStore((state) => state.executeWorkflowCommand);
  const createWorkflow = useProjectStore((state) => state.createWorkflow);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const nodeConfigDrawerOpen = useEditorStore((state) => state.nodeConfigDrawerOpen);
  const nodeDetailNodeId = useEditorStore((state) => state.nodeDetailNodeId);
  const helpTarget = useEditorStore((state) => state.helpTarget);
  const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);
  const copiedNodeId = useEditorStore((state) => state.copiedNodeId);
  const selectNode = useEditorStore((state) => state.selectNode);
  const closeNodeConfigDrawer = useEditorStore((state) => state.closeNodeConfigDrawer);
  const closeNodeDetail = useEditorStore((state) => state.closeNodeDetail);
  const openHelp = useEditorStore((state) => state.openHelp);
  const closeHelp = useEditorStore((state) => state.closeHelp);
  const selectEdge = useEditorStore((state) => state.selectEdge);
  const copyNode = useEditorStore((state) => state.copyNode);
  const resetWorkflowSession = useEditorStore((state) => state.resetWorkflowSession);
  const [explorerExpanded, setExplorerExpanded] = useState(true);
  const [nodePaletteExpanded, setNodePaletteExpanded] = useState(true);
  const [androidInspectorCollapsed, setAndroidInspectorCollapsed] = useState(false);
  const [nodeCatalog, setNodeCatalog] = useState<NodeDefinition[]>([]);
  const [nodeCatalogStatus, setNodeCatalogStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [nodeCatalogError, setNodeCatalogError] = useState<string | null>(null);
  const [activeWorkflowPath, setActiveWorkflowPath] = useState<string | null>(null);
  const [openWorkflowPaths, setOpenWorkflowPaths] = useState<string[]>([]);
  const [actionList, setActionList] = useState<{
    mode: 'command' | 'context';
    position?: { x: number; y: number };
  } | null>(null);
  const explorerPanelRef = usePanelRef();
  const nodePalettePanelRef = usePanelRef();
  const androidInspectorPanelRef = usePanelRef();
  const attemptedProjectId = useRef<string | null>(null);
  useProjectCloseGuard(dirty, flushLocalSave);

  useEffect(() => {
    if (!session && projectId && status === 'idle' && attemptedProjectId.current !== projectId) {
      attemptedProjectId.current = projectId;
      void open(projectId);
    }
  }, [open, projectId, session, status]);

  const loadNodeCatalog = useCallback(async (refresh = false) => {
    await Promise.resolve();
    setNodeCatalogStatus('loading');
    setNodeCatalog([]);
    setNodeCatalogError(null);
    if (!window.studioHost) {
      setNodeCatalogStatus('error');
      setNodeCatalogError('Node catalog is only available in the desktop app.');
      return;
    }

    try {
      const result = refresh
        ? await window.studioHost.catalog.refresh(DEFAULT_NODE_CATALOG_RUNTIME_VERSION)
        : await window.studioHost.catalog.load(DEFAULT_NODE_CATALOG_RUNTIME_VERSION);
      if (!result.ok) {
        setNodeCatalogStatus('error');
        setNodeCatalogError(result.error.message);
        return;
      }

      setNodeCatalog(toWorkflowNodeCatalog(result.value.nodes));
      setNodeCatalogStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load node catalog.';
      const needsDesktopRestart = message.includes('No handler registered');
      setNodeCatalogStatus('error');
      setNodeCatalogError(
        needsDesktopRestart
          ? 'The desktop process is out of date. Restart the desktop app, then retry.'
          : message,
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNodeCatalog(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNodeCatalog]);

  const document = session?.snapshot.document;
  const workflowPath =
    activeWorkflowPath && document?.workflows[activeWorkflowPath]
      ? activeWorkflowPath
      : (document?.manifest.entryWorkflow ?? '');
  const workflow = document?.workflows[workflowPath];

  const permissionIds = useMemo(
    () => document?.manifest.permissions.map((permission) => permission.id) ?? [],
    [document?.manifest.permissions],
  );
  const issues = useMemo(
    () =>
      workflow && nodeCatalogStatus === 'ready'
        ? validateWorkflow(workflow, nodeCatalog, permissionIds)
        : [],
    [nodeCatalog, nodeCatalogStatus, permissionIds, workflow],
  );
  const execute = useCallback(
    (command: WorkflowCommand) =>
      workflowPath ? executeWorkflowCommand(workflowPath, command, nodeCatalog) : false,
    [executeWorkflowCommand, nodeCatalog, workflowPath],
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

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (!workflow) return false;
      const connectionCount = workflow.edges.filter(
        (edge) => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId,
      ).length;
      if (
        connectionCount > 0 &&
        !window.confirm(
          `Delete this node and ${connectionCount} connection${connectionCount === 1 ? '' : 's'}?`,
        )
      ) {
        return false;
      }
      const removed = execute({ type: 'node.remove', payload: { nodeId } });
      if (removed) {
        selectNode(null);
        closeNodeDetail();
      }
      return removed;
    },
    [closeNodeDetail, execute, selectNode, workflow],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        if (session && localSaveStatus !== 'saving-local') void flushLocalSave();
        return;
      }
      if (modifier && key === 'p') {
        event.preventDefault();
        setActionList({ mode: 'command' });
        return;
      }
      if (helpTarget || nodeDetailNodeId) return;
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
      } else if (modifier && key === 'x' && selectedNodeId) {
        event.preventDefault();
        copyNode(selectedNodeId);
        deleteNode(selectedNodeId);
      } else if (modifier && key === 'v' && copiedNodeId) {
        event.preventDefault();
        duplicateNode(copiedNodeId);
      } else if (modifier && key === 'd' && selectedNodeId) {
        event.preventDefault();
        duplicateNode(selectedNodeId);
      } else if (modifier && key === 'e') {
        event.preventDefault();
        void exportProject();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId) {
        event.preventDefault();
        execute({ type: 'edge.remove', payload: { edgeId: selectedEdgeId } });
        selectEdge(null);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
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
    deleteNode,
    duplicateNode,
    execute,
    exportProject,
    redo,
    flushLocalSave,
    helpTarget,
    localSaveStatus,
    nodeDetailNodeId,
    selectEdge,
    selectNode,
    selectedEdgeId,
    selectedNodeId,
    session,
    status,
    undo,
  ]);

  useEffect(() => {
    return () => resetWorkflowSession();
  }, [resetWorkflowSession]);

  if (!session && status === 'opening') {
    return (
      <div className="grid h-full place-items-center bg-editor-canvas text-sm text-muted-foreground">
        Opening local project…
      </div>
    );
  }

  if (!session || !document || !workflow || session.snapshot.localId !== projectId) {
    return (
      <div className="grid h-full place-items-center bg-editor-canvas p-8 text-center">
        <div className="max-w-md rounded-xl border border-border bg-card p-7 shadow-xl">
          <Folder className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">No project is loaded</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Open or create a project before entering its workspace.
          </p>
          <Button className="mt-5" onClick={() => navigate('/projects')}>
            <span className="text-sm font-medium">Go to projects</span>
          </Button>
        </div>
      </div>
    );
  }

  const { manifest } = document;
  const visibleOpenWorkflowPaths = openWorkflowPaths.filter((path) => document.workflows[path]);
  if (visibleOpenWorkflowPaths.length === 0) visibleOpenWorkflowPaths.push(workflowPath);
  const saving = localSaveStatus === 'saving-local';
  const exporting = status === 'exporting';
  const syncing = cloudStatus === 'syncing';
  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedNodeDefinition = selectedNode
    ? nodeCatalog.find((definition) => definition.type === selectedNode.type)
    : undefined;
  const detailNode = workflow.nodes.find((node) => node.id === nodeDetailNodeId) ?? null;
  const detailNodeDefinition = detailNode
    ? nodeCatalog.find((definition) => definition.type === detailNode.type)
    : null;
  const androidSelectorTargets = getAndroidSelectorTargets(selectedNode, selectedNodeDefinition);
  const localSaveLabel = {
    dirty: 'Unsaved changes',
    'local-save-error': 'Local save failed',
    'saved-local': 'Saved locally',
    'saving-local': 'Saving locally…',
  }[localSaveStatus];
  const localSaveTone =
    localSaveStatus === 'local-save-error'
      ? 'bg-destructive/15 text-destructive'
      : dirty || saving
        ? 'bg-warning/15 text-warning'
        : 'bg-success/15 text-success';
  const cloudSyncLabel =
    session.snapshot.draftState.syncStatus === 'local-only'
      ? 'Not synced'
      : session.snapshot.draftState.syncStatus.replaceAll('-', ' ');
  const remoteAhead = session.snapshot.draftState.syncStatus === 'remote-ahead';

  const confirmUpdateFromCloud = async () => {
    const { baseRemoteVersion, observedRemoteVersion } = session.snapshot.draftState;
    if (
      !window.confirm(
        `Replace this clean local working copy (cloud baseline v${baseRemoteVersion ?? 'none'}) with cloud draft v${observedRemoteVersion ?? 'unknown'}? This cannot be undone.`,
      )
    )
      return;
    if (await updateFromCloud()) resetWorkflowSession();
  };

  const returnToProjects = async () => {
    if (!(await flushLocalSave())) return;
    navigate('/projects');
  };
  const closeProject = async () => {
    if (!(await close())) {
      if (!window.confirm('Local save failed. Close and discard unsaved changes?')) return;
      discard();
    }
    resetWorkflowSession();
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
  const openWorkflow = (path: string) => {
    if (!path) return;
    setOpenWorkflowPaths((paths) => (paths.includes(path) ? paths : [...paths, path]));
    setActiveWorkflowPath(path);
    selectNode(null);
    selectEdge(null);
    copyNode(null);
    closeNodeDetail();
    closeNodeConfigDrawer();
  };
  const closeWorkflowTab = (path: string) => {
    if (visibleOpenWorkflowPaths.length === 1) return;
    const index = visibleOpenWorkflowPaths.indexOf(path);
    const next = visibleOpenWorkflowPaths.filter((candidate) => candidate !== path);
    setOpenWorkflowPaths(next);
    if (path === workflowPath) {
      setActiveWorkflowPath(next[Math.max(0, index - 1)] ?? manifest.entryWorkflow);
    }
  };
  const promptCreateWorkflow = (kind: 'flow' | 'subflow') => {
    const fallback = `${kind === 'flow' ? 'flow' : 'subflow'}-${document.manifest.workflows.length + 1}`;
    const name = window.prompt(`Name for the new ${kind}`, fallback);
    if (!name) return;
    const path = createWorkflow(name, kind);
    if (path) openWorkflow(path);
  };
  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    if (execute({ type: 'edge.remove', payload: { edgeId: selectedEdgeId } })) selectEdge(null);
  };
  const actions: WorkflowAction[] = [
    {
      id: 'show-actions',
      label: 'Show action list',
      shortcut: 'Ctrl+P',
      run: () => window.setTimeout(() => setActionList({ mode: 'command' }), 0),
    },
    {
      id: 'new-flow',
      label: 'Insert: New flow',
      icon: Plus,
      run: () => promptCreateWorkflow('flow'),
    },
    {
      id: 'new-subflow',
      label: 'Insert: New subflow',
      icon: Network,
      run: () => promptCreateWorkflow('subflow'),
    },
    {
      id: 'add-node',
      label: 'Insert: Add node from catalog',
      icon: Plus,
      disabled: nodeCatalogStatus !== 'ready',
      run: () => globalThis.document.getElementById('node-palette-search')?.focus(),
    },
    {
      id: 'undo',
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      icon: Undo2,
      disabled: undoStack.length === 0,
      run: undo,
    },
    {
      id: 'redo',
      label: 'Redo',
      shortcut: 'Ctrl+Y',
      icon: Redo2,
      disabled: redoStack.length === 0,
      run: redo,
    },
    {
      id: 'cut-node',
      label: 'Cut selected node',
      shortcut: 'Ctrl+X',
      icon: Scissors,
      disabled: !selectedNodeId,
      run: () => {
        if (!selectedNodeId) return;
        copyNode(selectedNodeId);
        deleteNode(selectedNodeId);
      },
    },
    {
      id: 'copy-node',
      label: 'Copy selected node',
      shortcut: 'Ctrl+C',
      icon: Copy,
      disabled: !selectedNodeId,
      run: () => selectedNodeId && copyNode(selectedNodeId),
    },
    {
      id: 'paste-node',
      label: 'Paste node',
      shortcut: 'Ctrl+V',
      icon: Copy,
      disabled: !copiedNodeId,
      run: () => copiedNodeId && duplicateNode(copiedNodeId),
    },
    {
      id: 'delete-edge',
      label: 'Delete connection',
      shortcut: 'Delete',
      icon: Trash2,
      disabled: !selectedEdgeId,
      run: deleteSelectedEdge,
    },
    {
      id: 'delete-node',
      label: 'Delete node and connections',
      shortcut: 'Delete',
      icon: Trash2,
      disabled: !selectedNodeId,
      run: () => selectedNodeId && deleteNode(selectedNodeId),
    },
    {
      id: 'export',
      label: 'Export project',
      shortcut: 'Ctrl+E',
      icon: SaveAll,
      run: () => void exportProject(),
    },
  ];

  return (
    <div className="flex h-full min-h-130 flex-col overflow-hidden bg-editor-canvas">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => void returnToProjects()}
            className="hover:text-foreground"
          >
            Projects
          </button>
          <ChevronRight className="size-3" />
          <span className="truncate font-medium text-foreground">{manifest.name}</span>
          <span
            className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${localSaveTone}`}
          >
            {localSaveLabel}
          </span>
          {cloudAvailable ? (
            <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
              {cloudSyncLabel}
            </span>
          ) : null}
          <span className="ml-2 text-[10px]">
            {workflow.nodes.length} nodes · {issues.length} problems
          </span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Button size="sm" variant="ghost" onClick={undo} disabled={undoStack.length === 0}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={redo} disabled={redoStack.length === 0}>
            <Redo2 /> Redo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void closeProject()}>
            <X /> Close
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void exportProject()}
            disabled={saving || exporting}
          >
            <SaveAll /> {exporting ? 'Exporting…' : 'Export'}
          </Button>
          {cloudAvailable ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void syncCloud()}
              disabled={saving || syncing}
              title="Sync the durable local revision with cloud"
            >
              <CloudUpload /> {syncing ? 'Syncing…' : 'Sync'}
            </Button>
          ) : null}
          {cloudAvailable && remoteAhead ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void confirmUpdateFromCloud()}
              disabled={saving || syncing || dirty}
              title="Replace the clean local copy with the newer cloud draft"
            >
              <CloudDownload /> {syncing ? 'Updating…' : 'Update from cloud'}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void flushLocalSave()}
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
      {cloudError ? (
        <div
          role="alert"
          className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          {cloudError}
        </div>
      ) : null}

      <Group className="min-h-0 flex-1" orientation="vertical">
        <Panel defaultSize="72%" minSize="42%">
          <Group className="h-full" orientation="horizontal">
            <Panel defaultSize="21%" minSize="16%" maxSize="32%">
              <aside
                className="h-full min-h-0 overflow-hidden bg-panel"
                aria-label="Project explorer and node palette"
              >
                <Group className="h-full min-h-0" orientation="vertical">
                  <Panel
                    id="explorer-panel"
                    panelRef={explorerPanelRef}
                    defaultSize="34%"
                    minSize="84px"
                    collapsedSize="36px"
                    collapsible
                    groupResizeBehavior={
                      explorerExpanded ? 'preserve-relative-size' : 'preserve-pixel-size'
                    }
                    onResize={(size) => setExplorerExpanded(size.inPixels > 48)}
                  >
                    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
                      <button
                        type="button"
                        aria-expanded={explorerExpanded}
                        aria-controls="project-explorer-tree"
                        onClick={() => {
                          if (explorerExpanded) {
                            setExplorerExpanded(false);
                            explorerPanelRef.current?.collapse();
                            return;
                          }

                          setExplorerExpanded(true);
                          setNodePaletteExpanded(false);
                          nodePalettePanelRef.current?.collapse();
                          explorerPanelRef.current?.expand();
                          explorerPanelRef.current?.resize('100%');
                        }}
                        className="flex h-9 w-full shrink-0 items-center gap-1.5 px-2.5 text-left uppercase text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                      >
                        {explorerExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                        <span className="font-semibold text-xs">Explorer</span>
                      </button>
                      {explorerExpanded ? (
                        <WorkflowExplorer
                          document={document}
                          catalog={nodeCatalog}
                          activeWorkflowPath={workflowPath}
                          onOpenWorkflow={openWorkflow}
                          onCreate={promptCreateWorkflow}
                        />
                      ) : null}
                    </section>
                  </Panel>

                  <SidebarResizeHandle />

                  <Panel
                    id="node-palette-panel"
                    panelRef={nodePalettePanelRef}
                    defaultSize="66%"
                    minSize="84px"
                    collapsedSize="36px"
                    collapsible
                    groupResizeBehavior={
                      nodePaletteExpanded ? 'preserve-relative-size' : 'preserve-pixel-size'
                    }
                    onResize={(size) => setNodePaletteExpanded(size.inPixels > 48)}
                  >
                    <NodePalette
                      catalog={nodeCatalog}
                      status={nodeCatalogStatus}
                      error={nodeCatalogError}
                      onRetry={() => void loadNodeCatalog(true)}
                      onAdd={addFromPalette}
                      expanded={nodePaletteExpanded}
                      onExpandedChange={(expanded) => {
                        if (!expanded) {
                          setNodePaletteExpanded(false);
                          nodePalettePanelRef.current?.collapse();
                          return;
                        }

                        setNodePaletteExpanded(true);
                        setExplorerExpanded(false);
                        explorerPanelRef.current?.collapse();
                        nodePalettePanelRef.current?.expand();
                        nodePalettePanelRef.current?.resize('100%');
                      }}
                    />
                  </Panel>

                  <Panel id="sidebar-fill-panel" defaultSize="1px" minSize="0px" aria-hidden />
                </Group>
              </aside>
            </Panel>
            <ResizeHandle orientation="horizontal" />
            <Panel defaultSize="57%" minSize="34%">
              <div className="relative h-full overflow-hidden">
                <section
                  className="flex h-full flex-col bg-editor-canvas"
                  aria-label="Workflow canvas"
                >
                  <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-border bg-panel/80 px-1 text-xs">
                    {visibleOpenWorkflowPaths.map((path) => (
                      <div
                        key={path}
                        className={
                          'flex h-9 shrink-0 items-center border-r border-border px-2 ' +
                          (path === workflowPath
                            ? 'border-b-2 border-b-primary bg-editor-canvas text-foreground'
                            : 'text-muted-foreground hover:bg-accent/40')
                        }
                      >
                        <button type="button" onClick={() => openWorkflow(path)} className="px-1">
                          {path.split('/').at(-1)?.replace('.workflow.json', '') ?? 'Workflow'}
                        </button>
                        <button
                          type="button"
                          onClick={() => closeWorkflowTab(path)}
                          disabled={visibleOpenWorkflowPaths.length === 1}
                          aria-label={`Close ${path.split('/').at(-1)} tab`}
                          className="ml-1 rounded p-0.5 hover:bg-accent disabled:opacity-30"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => promptCreateWorkflow('flow')}
                      aria-label="Create flow"
                      title="Create flow"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded hover:bg-accent"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <ReactFlowProvider key={workflowPath}>
                      <WorkflowCanvas
                        catalog={nodeCatalog}
                        workflow={workflow}
                        issues={issues}
                        execute={execute}
                        onDeleteNode={deleteNode}
                        onOpenContextMenu={(position) =>
                          setActionList({ mode: 'context', position })
                        }
                      />
                    </ReactFlowProvider>
                  </div>
                </section>
                <NodeConfigDrawer
                  open={nodeConfigDrawerOpen && Boolean(selectedNode)}
                  catalog={nodeCatalog}
                  node={selectedNode}
                  issues={issues}
                  execute={execute}
                  onDuplicate={() => selectedNode && duplicateNode(selectedNode.id)}
                  onDelete={() => {
                    if (!selectedNode) return;
                    deleteNode(selectedNode.id);
                  }}
                  onClose={closeNodeConfigDrawer}
                />
              </div>
            </Panel>
            <ResizeHandle orientation="horizontal" />
            <Panel
              id="android-inspector-panel"
              panelRef={androidInspectorPanelRef}
              defaultSize="22%"
              minSize="18%"
              maxSize="36%"
              collapsedSize="38px"
              collapsible
              onResize={(size) => setAndroidInspectorCollapsed(size.inPixels <= 48)}
            >
              <AndroidInspectorPanel
                collapsed={androidInspectorCollapsed}
                selectorTargets={androidSelectorTargets}
                onCollapse={() => androidInspectorPanelRef.current?.collapse()}
                onExpand={() => androidInspectorPanelRef.current?.expand()}
                onUseSelector={(target, selector) =>
                  androidSelectorTargets.some(
                    (candidate) =>
                      candidate.nodeId === target.nodeId &&
                      candidate.propertyName === target.propertyName,
                  ) &&
                  execute({
                    type: 'node.updateParams',
                    payload: {
                      nodeId: target.nodeId,
                      changes: {
                        [target.propertyName]: androidSelectorToJsonValue(selector),
                      },
                    },
                  })
                }
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
      <NodeDetailDialog
        key={nodeDetailNodeId ?? 'closed-node-detail'}
        node={detailNode}
        definition={detailNodeDefinition ?? null}
        execute={execute}
        onHelp={() => {
          if (detailNodeDefinition) {
            openHelp({ type: detailNodeDefinition.type, version: detailNodeDefinition.version });
          }
        }}
        onDelete={() => nodeDetailNodeId && deleteNode(nodeDetailNodeId)}
        onClose={closeNodeDetail}
      />
      <NodeHelpDialog
        target={helpTarget}
        definition={
          nodeCatalog.find(
            (definition) =>
              definition.type === helpTarget?.type && definition.version === helpTarget.version,
          ) ?? null
        }
        onClose={closeHelp}
      />
      {actionList ? (
        <WorkflowActionList
          open
          mode={actionList.mode}
          position={actionList.position}
          actions={actions}
          onClose={() => setActionList(null)}
        />
      ) : null}
    </div>
  );
}
