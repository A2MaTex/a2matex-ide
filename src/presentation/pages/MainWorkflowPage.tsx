import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CirclePlay,
  CloudDownload,
  CloudUpload,
  Copy,
  Folder,
  List,
  ListChecks,
  Network,
  PanelBottom,
  PanelLeft,
  Plus,
  Redo2,
  Save,
  SaveAll,
  Scissors,
  Trash2,
  Undo2,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

import { toWorkflowNodeCatalog } from '@application/node-catalog/to-workflow-node-catalog';
import type { RuntimeStartDeviceInput, RuntimeStatus } from '@application/runtime/runtime.types';
import { DEFAULT_NODE_CATALOG_RUNTIME_VERSION } from '@domain/node-catalog/node-catalog';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import { validateWorkflow } from '@domain/workflow/workflow-validator';
import { Button } from '@presentation/components/ui/button';
import { toast } from '@presentation/components/ui/toast-store';
import { useProjectCloseGuard } from '@presentation/features/project-session/use-project-close-guard';
import { TestRunDialog } from '@presentation/features/test-run/TestRunDialog';
import { WorkflowInputsDialog } from '@presentation/features/workflow-inputs/WorkflowInputsDialog';
import { workflowInputFieldsFromSchema } from '@domain/workflow/workflow-inputs';
import { useTestRunExecution } from '@presentation/features/test-run/useTestRunExecution';
import {
  useProjectStore,
  useProjectStoreApi,
} from '@presentation/features/project-session/use-project-store';
import { NodeConfigDrawer } from '@presentation/features/workflow-editor/NodeConfigDrawer';
import { NodeDetailDialog } from '@presentation/features/workflow-editor/NodeDetailDialog';
import { NodeHelpDialog } from '@presentation/features/workflow-editor/NodeHelpDialog';
import { NodePalette } from '@presentation/features/workflow-editor/NodePalette';
import { ProblemsPanel } from '@presentation/features/workflow-editor/ProblemsPanel';
import { RunDeviceChips } from '@presentation/features/test-run/RunDeviceChips';
import { RunMatrix } from '@presentation/features/test-run/RunMatrix';
import { runControlAvailability } from '@presentation/features/test-run/run-controls';
import { RunOverlayContext, useRunOverlay } from '@presentation/features/test-run/run-overlay';
import { WorkflowCanvas } from '@presentation/features/workflow-editor/WorkflowCanvas';
import {
  WorkflowActionList,
  type WorkflowAction,
} from '@presentation/features/workflow-editor/WorkflowActionList';
import { WorkflowExplorer } from '@presentation/features/workflow-editor/WorkflowExplorer';
import { useWorkflowValidation } from '@presentation/features/workflow-editor/useWorkflowValidation';
import { useEditorStore } from '@presentation/stores/editor-store';
import { projectStoreIsDirty } from '@presentation/stores/project-store';
import URL from '@/app/constants/url';

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
  const projectStore = useProjectStoreApi();
  const session = useProjectStore((state) => state.session);
  const status = useProjectStore((state) => state.status);
  const error = useProjectStore((state) => state.error);
  const undoStack = useProjectStore((state) => state.undoStack);
  const redoStack = useProjectStore((state) => state.redoStack);
  const dirty = useProjectStore(projectStoreIsDirty);
  const localSaveStatus = useProjectStore((state) => state.localSaveStatus);
  const pendingNodeConfigurationId = useProjectStore((state) => state.pendingNodeConfigurationId);
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
  const migrateCatalogGraph = useProjectStore((state) => state.migrateCatalogGraph);
  const setPendingNodeConfiguration = useProjectStore((state) => state.setPendingNodeConfiguration);
  const createWorkflow = useProjectStore((state) => state.createWorkflow);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const nodeConfigDrawerOpen = useEditorStore((state) => state.nodeConfigDrawerOpen);
  const nodeConfigNodeId = useEditorStore((state) => state.nodeConfigNodeId);
  const nodeDetailNodeId = useEditorStore((state) => state.nodeDetailNodeId);
  const helpTarget = useEditorStore((state) => state.helpTarget);
  const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);
  const copiedNodeId = useEditorStore((state) => state.copiedNodeId);
  const selectNode = useEditorStore((state) => state.selectNode);
  const openNodeConfigDrawer = useEditorStore((state) => state.openNodeConfigDrawer);
  const closeNodeConfigDrawer = useEditorStore((state) => state.closeNodeConfigDrawer);
  const closeNodeDetail = useEditorStore((state) => state.closeNodeDetail);
  const openHelp = useEditorStore((state) => state.openHelp);
  const closeHelp = useEditorStore((state) => state.closeHelp);
  const selectEdge = useEditorStore((state) => state.selectEdge);
  const copyNode = useEditorStore((state) => state.copyNode);
  const resetWorkflowSession = useEditorStore((state) => state.resetWorkflowSession);
  const setActiveBottomTab = useEditorStore((state) => state.setActiveBottomTab);
  const [explorerExpanded, setExplorerExpanded] = useState(true);
  const [nodePaletteExpanded, setNodePaletteExpanded] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const [nodeCatalog, setNodeCatalog] = useState<NodeDefinition[]>([]);
  const [nodeCatalogStatus, setNodeCatalogStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [nodeCatalogError, setNodeCatalogError] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({ state: 'STOPPED' });
  const [runtimeOperationError, setRuntimeOperationError] = useState<string | null>(null);
  const [testRunDialogOpen, setTestRunDialogOpen] = useState(false);
  const [inputsDialogOpen, setInputsDialogOpen] = useState(false);
  const updateWorkflowInputs = useProjectStore((state) => state.updateWorkflowInputs);
  const [activeWorkflowPath, setActiveWorkflowPath] = useState<string | null>(null);
  const [openWorkflowPaths, setOpenWorkflowPaths] = useState<string[]>([]);
  const [actionList, setActionList] = useState<{
    mode: 'command' | 'context';
    position?: { x: number; y: number };
  } | null>(null);
  const explorerPanelRef = usePanelRef();
  const nodePalettePanelRef = usePanelRef();
  const sidebarPanelRef = usePanelRef();
  const bottomPanelRef = usePanelRef();
  const togglePanel = (ref: typeof sidebarPanelRef) => {
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
    // Keep the toolbar's pressed state in sync even when the panel shrinks to 0px.
    window.setTimeout(() => {
      setSidebarCollapsed(sidebarPanelRef.current?.isCollapsed() ?? false);
      setBottomCollapsed(bottomPanelRef.current?.isCollapsed() ?? false);
    }, 0);
  };
  const openNodePalette = () => {
    sidebarPanelRef.current?.expand();
    nodePalettePanelRef.current?.expand();
    window.setTimeout(() => window.document.getElementById('node-palette-search')?.focus(), 50);
  };
  const attemptedProjectId = useRef<string | null>(null);
  const previousRuntimeStateRef = useRef(runtimeStatus.state);

  const flushBeforeClose = useCallback(
    () => (pendingNodeConfigurationId ? Promise.resolve(false) : flushLocalSave()),
    [flushLocalSave, pendingNodeConfigurationId],
  );
  useProjectCloseGuard(dirty || Boolean(pendingNodeConfigurationId), flushBeforeClose);

  const configureNode = useCallback(
    (nodeId: string) => {
      if (
        nodeConfigNodeId !== nodeId &&
        pendingNodeConfigurationId &&
        !window.confirm('Discard unsaved node configuration changes?')
      ) {
        return;
      }
      if (nodeConfigNodeId !== nodeId) setPendingNodeConfiguration(null);
      openNodeConfigDrawer(nodeId);
    },
    [
      nodeConfigNodeId,
      openNodeConfigDrawer,
      pendingNodeConfigurationId,
      setPendingNodeConfiguration,
    ],
  );

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
      const message = 'Node catalog is only available in the desktop app.';
      setNodeCatalogStatus('error');
      setNodeCatalogError(message);
      if (refresh) toast.error('Catalog refresh failed', { description: message });
      return;
    }

    try {
      const result = refresh
        ? await window.studioHost.catalog.refresh(DEFAULT_NODE_CATALOG_RUNTIME_VERSION)
        : await window.studioHost.catalog.load(DEFAULT_NODE_CATALOG_RUNTIME_VERSION);
      if (!result.ok) {
        setNodeCatalogStatus('error');
        setNodeCatalogError(result.error.message);
        if (refresh) toast.error('Catalog refresh failed', { description: result.error.message });
        return;
      }

      setNodeCatalog(toWorkflowNodeCatalog(result.value.nodes));
      setNodeCatalogStatus('ready');
      if (refresh) toast.success('Node catalog refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load node catalog.';
      const needsDesktopRestart = message.includes('No handler registered');
      setNodeCatalogStatus('error');
      setNodeCatalogError(
        needsDesktopRestart
          ? 'The desktop process is out of date. Restart the desktop app, then retry.'
          : message,
      );
      if (refresh) toast.error('Catalog refresh failed', { description: message });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNodeCatalog(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNodeCatalog]);

  useEffect(() => {
    if (!window.studioHost) return;
    let active = true;
    void window.studioHost.runtime.getStatus().then((result) => {
      if (active && result.ok) setRuntimeStatus(result.value);
    });
    const unsubscribe = window.studioHost.runtime.onStatusChanged((nextStatus) => {
      if (active) setRuntimeStatus(nextStatus);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const activeProjectLocalId = session?.snapshot.localId;
  const testRun = useTestRunExecution(activeProjectLocalId ?? null);
  // Run status on the canvas: tier 1 (selected device) and tier 2 (per-node device summary).
  const runOverlayAll = useRunOverlay(
    testRun.state.snapshot,
    testRun.state.attemptsRevision,
    testRun.state.selectedDeviceExecutionId,
  );
  const [hiddenRunGroupId, setHiddenRunGroupId] = useState<string | null>(null);
  const runOverlay =
    runOverlayAll && testRun.state.snapshot?.runGroup.id !== hiddenRunGroupId
      ? runOverlayAll
      : null;
  const autoFocusedRunRef = useRef<string | null>(null);
  useEffect(() => {
    const snapshot = testRun.state.snapshot;
    if (!snapshot || autoFocusedRunRef.current === snapshot.runGroup.id) return;
    const finished = !['RUNNING', 'PAUSED'].includes(snapshot.runGroup.status);
    if (!finished) return;
    autoFocusedRunRef.current = snapshot.runGroup.id;
    // When a run ends with a failure, show the first failed device: that's what needs a look.
    const failed = snapshot.deviceExecutions.find((device) => device.status === 'FAILED');
    if (failed && failed.id !== testRun.state.selectedDeviceExecutionId) {
      testRun.selectDeviceExecution(failed.id);
    }
  }, [testRun, testRun.state.snapshot, testRun.state.selectedDeviceExecutionId]);
  // Start with the bottom panel collapsed to its tab bar so the canvas gets the height.
  useEffect(() => {
    // The panel group registers its panels after the first paint, so collapse on the next tick.
    const timer = window.setTimeout(() => {
      bottomPanelRef.current?.collapse();
      setBottomCollapsed(true);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [bottomPanelRef]);
  // Open the bottom panel when a run is in progress so its output is visible.
  useEffect(() => {
    if (testRun.unresolved) bottomPanelRef.current?.expand();
  }, [testRun.unresolved, bottomPanelRef]);

  useEffect(() => {
    if (nodeCatalogStatus !== 'ready' || !activeProjectLocalId) return;
    migrateCatalogGraph(nodeCatalog);
  }, [activeProjectLocalId, migrateCatalogGraph, nodeCatalog, nodeCatalogStatus]);

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
        ? validateWorkflow(
            workflow,
            nodeCatalog,
            permissionIds,
            session?.snapshot.draftState.inputSchema ?? {},
          )
        : [],
    [
      nodeCatalog,
      nodeCatalogStatus,
      permissionIds,
      session?.snapshot.draftState.inputSchema,
      workflow,
    ],
  );
  const {
    state: workflowValidation,
    validate: validateActiveWorkflow,
    busy: workflowValidationBusy,
  } = useWorkflowValidation(workflowPath);

  useEffect(() => {
    const previous = previousRuntimeStateRef.current;
    previousRuntimeStateRef.current = runtimeStatus.state;
    if (
      previous !== 'READY' &&
      runtimeStatus.state === 'READY' &&
      testRun.state.phase === 'recovery-failed'
    ) {
      void testRun.recover();
    }
  }, [runtimeStatus.state, testRun]);

  const startTestRun = useCallback(
    async (devices: RuntimeStartDeviceInput[]) => {
      setRuntimeOperationError(null);
      const outcome = await testRun.start(devices);
      setTestRunDialogOpen(false);
      setActiveBottomTab(outcome === 'COMPILE_INVALID' ? 'diagnostics' : 'output');
      if (outcome === 'STARTED') {
        toast.success('Test Run started');
      } else if (outcome === 'COMPILE_INVALID') {
        toast.warning('Test Run compilation failed', {
          description: 'Open the Run panel for compilation diagnostics.',
        });
      } else if (outcome === 'UNCERTAIN') {
        toast.warning('Test Run admission is uncertain', {
          description: 'Retry the exact admission from the Run panel.',
        });
      } else {
        toast.error('Test Run was not started', {
          description: 'Open the Run panel for details.',
        });
      }
    },
    [setActiveBottomTab, testRun],
  );

  const saveLocalWithToast = useCallback(async () => {
    const saved = await flushLocalSave();
    if (saved) toast.success('Project saved locally');
    else
      toast.error('Local save failed', {
        description: projectStore.getState().localSaveError ?? 'Unable to save the project.',
      });
    return saved;
  }, [flushLocalSave, projectStore]);

  const exportWithToast = useCallback(async () => {
    await exportProject();
    const exportError = projectStore.getState().error;
    if (exportError) toast.error('Project export failed', { description: exportError });
    else toast.success('Project exported');
  }, [exportProject, projectStore]);

  const syncWithToast = useCallback(async () => {
    if (await syncCloud()) toast.success('Project synced to cloud');
    else
      toast.error('Cloud sync failed', {
        description: projectStore.getState().cloudError ?? 'Unable to sync the project.',
      });
  }, [projectStore, syncCloud]);
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
        toast.success('Node duplicated');
      } else {
        toast.error('Unable to duplicate node');
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
        if (nodeConfigNodeId === nodeId) {
          setPendingNodeConfiguration(null);
          closeNodeConfigDrawer();
        }
        closeNodeDetail();
        toast.success('Node deleted');
      } else {
        toast.error('Unable to delete node');
      }
      return removed;
    },
    [
      closeNodeConfigDrawer,
      closeNodeDetail,
      execute,
      nodeConfigNodeId,
      selectNode,
      setPendingNodeConfiguration,
      workflow,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        if (session && localSaveStatus !== 'saving-local') void saveLocalWithToast();
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
        void exportWithToast();
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
    exportWithToast,
    redo,
    saveLocalWithToast,
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
        <div className="max-w-md">
          <Folder className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">No project is loaded</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Open or create a project before entering its workspace.
          </p>
          <Button className="mt-5" onClick={() => navigate(URL.ProjectHome)}>
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
  const configuredNode = workflow.nodes.find((node) => node.id === nodeConfigNodeId) ?? null;
  // Matrix columns: nodes in flow order (breadth-first from the entry node), then any others.
  const runMatrixColumns = (() => {
    const order: string[] = [];
    const seen = new Set<string>();
    const queue = [workflow.entryNodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id) || !workflow.nodes.some((node) => node.id === id)) continue;
      seen.add(id);
      order.push(id);
      for (const edge of workflow.edges)
        if (edge.sourceNodeId === id) queue.push(edge.targetNodeId);
    }
    for (const node of workflow.nodes) if (!seen.has(node.id)) order.push(node.id);
    return order.map((id) => {
      const node = workflow.nodes.find((entry) => entry.id === id)!;
      const definition = nodeCatalog.find((entry) => entry.type === node.type);
      return {
        nodeId: id,
        label: node.editor.name?.trim() || definition?.displayName || node.type,
      };
    });
  })();
  const detailNode = workflow.nodes.find((node) => node.id === nodeDetailNodeId) ?? null;
  const detailNodeDefinition = detailNode
    ? nodeCatalog.find((definition) => definition.type === detailNode.type)
    : null;
  const localSaveLabel = {
    dirty: 'Unsaved changes',
    'local-save-error': 'Local save failed',
    'saved-local': 'Saved',
    'saving-local': 'Saving…',
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
    if (await updateFromCloud()) {
      resetWorkflowSession();
      toast.success('Project updated from cloud');
    } else {
      toast.error('Cloud update failed', {
        description: projectStore.getState().cloudError ?? 'Unable to update the local project.',
      });
    }
  };

  const returnToProjects = async () => {
    if (!(await flushLocalSave())) {
      toast.error('Unable to leave workspace', {
        description: projectStore.getState().localSaveError ?? 'Local save failed.',
      });
      return;
    }
    navigate(URL.ProjectHome);
  };
  const closeProject = async () => {
    if (!(await close())) {
      if (!window.confirm('Local save failed. Close and discard unsaved changes?')) return;
      discard();
      toast.warning('Project closed with unsaved changes discarded');
    } else {
      toast.success('Project closed');
    }
    resetWorkflowSession();
    navigate(URL.ProjectHome);
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
      toast.success('Node added', { description: definition.displayName });
    } else {
      toast.error('Unable to add node', { description: definition.displayName });
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
    if (path) {
      openWorkflow(path);
      toast.success(`${kind === 'flow' ? 'Flow' : 'Subflow'} created`);
    } else {
      toast.error(`Unable to create ${kind}`);
    }
  };
  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    if (execute({ type: 'edge.remove', payload: { edgeId: selectedEdgeId } })) {
      selectEdge(null);
      toast.success('Connection deleted');
    } else {
      toast.error('Unable to delete connection');
    }
  };
  const actions: WorkflowAction[] = [
    {
      id: 'show-actions',
      label: 'Show action list',
      shortcut: 'Ctrl+P',
      icon: List,
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
      run: () => void exportWithToast(),
    },
    {
      id: 'validate-workflow',
      label: 'Validate saved workflow',
      icon: ListChecks,
      disabled: workflowValidationBusy,
      run: () => void validateActiveWorkflow(),
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
          <span
            className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              runtimeStatus.state === 'READY'
                ? 'bg-success/15 text-success'
                : runtimeStatus.state === 'FAILED'
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-secondary text-muted-foreground'
            }`}
            title={runtimeStatus.errorCode ?? runtimeStatus.runtimeVersion}
          >
            Runtime {runtimeStatus.state.toLowerCase()}
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
            onClick={() => void exportWithToast()}
            disabled={saving || exporting}
          >
            <SaveAll /> {exporting ? 'Exporting…' : 'Export'}
          </Button>
          {cloudAvailable ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void syncWithToast()}
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
            onClick={() => void saveLocalWithToast()}
            disabled={saving || !dirty}
          >
            <Save /> {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setInputsDialogOpen(true)}
            title="Define the values the person running this workflow enters for each device"
          >
            <SlidersHorizontal /> Inputs
            <span className="rounded bg-background/60 px-1 font-mono text-[10px]">
              {workflowInputFieldsFromSchema(session.snapshot.draftState.inputSchema).length}
            </span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void validateActiveWorkflow()}
            disabled={workflowValidationBusy}
            title="Save locally, then validate this workflow with the local Runtime"
          >
            <ListChecks />
            {workflowValidation.phase === 'saving'
              ? 'Saving…'
              : workflowValidation.phase === 'validating'
                ? 'Validating…'
                : 'Validate'}
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setTestRunDialogOpen(true)}
            disabled={
              testRun.unresolved ||
              workflowValidationBusy ||
              Boolean(pendingNodeConfigurationId) ||
              !window.studioHost
            }
            title={
              pendingNodeConfigurationId
                ? 'Save or discard the pending node configuration before running'
                : testRun.unresolved
                  ? 'Open the Run panel to view the current execution'
                  : 'Configure and start a Test Run on the saved entry workflow'
            }
          >
            <CirclePlay /> {testRun.runButtonLabel}
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
      {runtimeOperationError ? (
        <div
          role="alert"
          className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          {runtimeOperationError}
        </div>
      ) : null}

      <Group className="min-h-0 flex-1" orientation="vertical">
        <Panel minSize="30%">
          <Group className="h-full" orientation="horizontal">
            <Panel
              id="editor-sidebar-panel"
              panelRef={sidebarPanelRef}
              defaultSize="264px"
              minSize="220px"
              maxSize="440px"
              collapsible
              collapsedSize="0px"
              onResize={(size) => setSidebarCollapsed(size.inPixels <= 4)}
            >
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
            <Panel minSize="34%">
              <div className="relative h-full overflow-hidden">
                <div
                  className="canvas-floating-toolbar absolute right-3 top-12 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card p-1 shadow-sm"
                  aria-label="Editor layout"
                >
                  <button
                    type="button"
                    title="Add node"
                    aria-label="Add node"
                    onClick={openNodePalette}
                    className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-secondary"
                  >
                    <Plus className="size-4.5" />
                  </button>
                  <button
                    type="button"
                    title={
                      sidebarCollapsed
                        ? 'Show explorer and node palette'
                        : 'Hide explorer and node palette'
                    }
                    aria-label="Toggle explorer and node palette"
                    aria-pressed={!sidebarCollapsed}
                    onClick={() => togglePanel(sidebarPanelRef)}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground aria-pressed:text-primary"
                  >
                    <PanelLeft className="size-4.5" />
                  </button>
                  <button
                    type="button"
                    title={
                      bottomCollapsed
                        ? 'Show problems, diagnostics and run'
                        : 'Hide problems, diagnostics and run'
                    }
                    aria-label="Toggle problems, diagnostics and run panel"
                    aria-pressed={!bottomCollapsed}
                    onClick={() => togglePanel(bottomPanelRef)}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground aria-pressed:text-primary"
                  >
                    <PanelBottom className="size-4.5" />
                  </button>
                </div>
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
                  <div className="relative min-h-0 flex-1">
                    {runOverlay ? (
                      <RunDeviceChips
                        devices={runOverlay.devices}
                        selectedId={runOverlay.selectedDeviceExecutionId}
                        onSelect={testRun.selectDeviceExecution}
                        controls={runControlAvailability(testRun.state)}
                        onControl={(action) => void testRun.submitControl(action)}
                        onDismiss={() =>
                          setHiddenRunGroupId(testRun.state.snapshot?.runGroup.id ?? null)
                        }
                      />
                    ) : null}
                    <RunOverlayContext.Provider value={runOverlay}>
                      <ReactFlowProvider key={workflowPath}>
                        <WorkflowCanvas
                          catalog={nodeCatalog}
                          workflow={workflow}
                          issues={issues}
                          execute={execute}
                          onDeleteNode={deleteNode}
                          onConfigureNode={configureNode}
                          onOpenContextMenu={(position) =>
                            setActionList({ mode: 'context', position })
                          }
                        />
                      </ReactFlowProvider>
                    </RunOverlayContext.Provider>
                  </div>
                </section>
                <NodeConfigDrawer
                  open={nodeConfigDrawerOpen && Boolean(configuredNode)}
                  catalog={nodeCatalog}
                  workflow={workflow}
                  workflowInputSchema={session.snapshot.draftState.inputSchema}
                  node={configuredNode}
                  revision={session.workingRevision}
                  issues={issues}
                  execute={execute}
                  onPendingChange={setPendingNodeConfiguration}
                  onDuplicate={() => configuredNode && duplicateNode(configuredNode.id)}
                  onDelete={() => {
                    if (!configuredNode) return;
                    deleteNode(configuredNode.id);
                  }}
                  onClose={closeNodeConfigDrawer}
                />
              </div>
            </Panel>
          </Group>
        </Panel>
        <ResizeHandle orientation="vertical" />
        <Panel
          id="editor-bottom-panel"
          panelRef={bottomPanelRef}
          defaultSize="48px"
          minSize="180px"
          maxSize="60%"
          collapsible
          collapsedSize="48px"
          onResize={(size) => setBottomCollapsed(size.inPixels <= 56)}
        >
          <div
            className="relative h-full"
            onClickCapture={(event) => {
              if (!bottomCollapsed) return;
              const target = event.target as HTMLElement;
              if (target.closest('section > div:first-child button'))
                bottomPanelRef.current?.expand();
            }}
          >
            <button
              type="button"
              onClick={() => togglePanel(bottomPanelRef)}
              aria-label={bottomCollapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
              title={bottomCollapsed ? 'Expand' : 'Collapse'}
              className="absolute right-3 top-2.5 z-10 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {bottomCollapsed ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
            <ProblemsPanel
              issues={issues}
              revision={session.workingRevision}
              savedRevision={session.savedRevision}
              validation={workflowValidation}
              onValidate={() => void validateActiveWorkflow()}
              onCheckRunControl={() => void testRun.checkControl()}
              onRunControl={(action) => void testRun.submitControl(action)}
              run={testRun.state}
              onRecoverRun={() => void testRun.recover()}
              onRetryRunAdmission={() => void testRun.retryAdmission()}
              runMatrix={
                runOverlayAll ? (
                  <RunMatrix
                    overlay={runOverlayAll}
                    columns={runMatrixColumns}
                    selectedNodeId={selectedNodeId}
                    onSelect={(deviceExecutionId, nodeId) => {
                      setHiddenRunGroupId(null);
                      testRun.selectDeviceExecution(deviceExecutionId);
                      if (nodeId) useEditorStore.getState().selectNode(nodeId);
                    }}
                  />
                ) : null
              }
            />
          </div>
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
      <WorkflowInputsDialog
        document={session.snapshot.document}
        inputSchema={session.snapshot.draftState.inputSchema}
        onOpenChange={setInputsDialogOpen}
        onSave={(inputSchema, renames) => void updateWorkflowInputs(inputSchema, renames)}
        open={inputsDialogOpen}
      />
      <TestRunDialog
        key={session.snapshot.localId}
        busy={testRun.busy}
        hostReady={Boolean(window.studioHost)}
        inputSchema={session.snapshot.draftState.inputSchema}
        open={testRunDialogOpen}
        onOpenChange={setTestRunDialogOpen}
        onRun={startTestRun}
        runBlockedReason={
          pendingNodeConfigurationId
            ? 'Save or discard the pending node configuration before starting a Test Run.'
            : testRun.unresolved
              ? 'Resolve or finish the current Test Run before starting another one.'
              : null
        }
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
