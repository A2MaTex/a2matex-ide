import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  useReactFlow,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import type { WorkflowDocument } from '@domain/project/project';
import { findNodeDefinition } from '@domain/workflow/node-catalog';
import { connectionOutputsFor, type NodeDefinition } from '@domain/workflow/node-definition';
import { assertValidConnection, type WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { useEditorStore } from '@presentation/stores/editor-store';

import { AutomationNode } from '@presentation/features/workflow-editor/AutomationNode';
import {
  AddConnectedNodePanel,
  type ConnectedNodeChoice,
} from '@presentation/features/workflow-editor/AddConnectedNodePanel';
import { NODE_DRAG_MIME } from '@presentation/features/workflow-editor/NodePalette';
import {
  toReactFlowEdges,
  toReactFlowNodes,
  type AutomationFlowNode,
} from '@presentation/features/workflow-editor/react-flow-adapter';

interface WorkflowCanvasProps {
  catalog: readonly NodeDefinition[];
  workflow: WorkflowDocument;
  issues: WorkflowIssue[];
  execute(command: WorkflowCommand): boolean;
  onDeleteNode(nodeId: string): void;
  onOpenContextMenu(
    position: { x: number; y: number },
    target: { kind: 'canvas' } | { kind: 'node'; id: string } | { kind: 'edge'; id: string },
  ): void;
}

const nodeTypes = { automation: AutomationNode };

function nextNodeId(type: string) {
  void type;
  return crypto.randomUUID();
}

interface PendingConnection {
  sourceNodeId: string;
  sourcePort: string;
  panelPosition: { x: number; y: number };
  nodePosition: { x: number; y: number };
}

function clientPoint(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

export function WorkflowCanvas({
  catalog,
  workflow,
  issues,
  execute,
  onDeleteNode,
  onOpenContextMenu,
}: WorkflowCanvasProps) {
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);
  const selectNode = useEditorStore((state) => state.selectNode);
  const selectEdge = useEditorStore((state) => state.selectEdge);
  const openNodeDetail = useEditorStore((state) => state.openNodeDetail);
  const closeNodeConfigDrawer = useEditorStore((state) => state.closeNodeConfigDrawer);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const nodes = useMemo(
    () => toReactFlowNodes(workflow, selectedNodeId, issues, catalog),
    [catalog, issues, selectedNodeId, workflow],
  );
  const edges = useMemo(
    () => toReactFlowEdges(workflow, selectedEdgeId),
    [selectedEdgeId, workflow],
  );

  useEffect(() => {
    if (workflow.nodes.length === 0) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.28, duration: 180 });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, workflow.nodes.length]);

  const addNodeAt = useCallback(
    (nodeType: string, nodeVersion: number, position: { x: number; y: number }) => {
      const nodeId = nextNodeId(nodeType);
      const applied = execute({
        type: 'node.add',
        payload: { nodeId, nodeType, nodeVersion, position },
      });
      if (applied) selectNode(nodeId);
    },
    [execute, selectNode],
  );

  const connect = (connection: Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    ) {
      return;
    }
    execute({
      type: 'edge.connect',
      payload: {
        edgeId: 'edge-' + crypto.randomUUID().slice(0, 8),
        source: { nodeId: connection.source, port: connection.sourceHandle },
        target: { nodeId: connection.target, port: connection.targetHandle },
      },
    });
  };

  const reconnect = (edge: Edge, connection: Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    ) {
      return;
    }
    execute({
      type: 'edge.reconnect',
      payload: {
        edgeId: edge.id,
        source: { nodeId: connection.source, port: connection.sourceHandle },
        target: { nodeId: connection.target, port: connection.targetHandle },
      },
    });
  };

  const isValidConnection = (connection: Edge | Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    ) {
      return false;
    }
    try {
      assertValidConnection(
        workflow,
        {
          id: 'connection-preview',
          sourcePort: connection.sourceHandle,
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
        },
        catalog,
        connection.targetHandle,
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const value = event.dataTransfer.getData(NODE_DRAG_MIME);
    if (!value) return;
    const payload = JSON.parse(value) as { type?: string; version?: number };
    const definition = findNodeDefinition(payload.type ?? '', payload.version ?? 0, catalog);
    if (!definition) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNodeAt(definition.type, definition.version, {
      x: position.x - 90,
      y: position.y - 36,
    });
  };

  const beginNodeSuggestion = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid === false && state.toHandle) return;
    if (state.toNode || state.toHandle || state.fromHandle?.type !== 'source') return;
    const point = clientPoint(event);
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!point || !bounds || !state.fromHandle.id) return;
    setPendingConnection({
      sourceNodeId: state.fromHandle.nodeId,
      sourcePort: state.fromHandle.id,
      panelPosition: {
        x: Math.min(Math.max(8, point.x - bounds.left), Math.max(8, bounds.width - 296)),
        y: Math.min(Math.max(8, point.y - bounds.top), Math.max(8, bounds.height - 360)),
      },
      nodePosition: screenToFlowPosition(point),
    });
  };

  const openContextMenu = (
    event: ReactMouseEvent | MouseEvent,
    target: { kind: 'canvas' } | { kind: 'node'; id: string } | { kind: 'edge'; id: string },
  ) => {
    event.preventDefault();
    setPendingConnection(null);
    if (target.kind === 'node') selectNode(target.id);
    else if (target.kind === 'edge') selectEdge(target.id);
    else {
      selectNode(null);
      selectEdge(null);
    }
    onOpenContextMenu({ x: event.clientX, y: event.clientY }, target);
  };

  const addConnectedNode = (choice: ConnectedNodeChoice) => {
    if (!pendingConnection) return;
    const nodeId = nextNodeId(choice.definition.type);
    const applied = execute({
      type: 'node.addConnected',
      payload: {
        nodeId,
        nodeType: choice.definition.type,
        nodeVersion: choice.definition.version,
        position: {
          x: pendingConnection.nodePosition.x - 90,
          y: pendingConnection.nodePosition.y - 36,
        },
        edgeId: 'edge-' + crypto.randomUUID().slice(0, 8),
        source: {
          nodeId: pendingConnection.sourceNodeId,
          port: pendingConnection.sourcePort,
        },
        targetPort: choice.input.name,
      },
    });
    if (applied) selectNode(nodeId);
    setPendingConnection(null);
  };

  const suggestionSourceNode = pendingConnection
    ? workflow.nodes.find((node) => node.id === pendingConnection.sourceNodeId)
    : undefined;
  const suggestionSourceDefinition = suggestionSourceNode
    ? catalog.find((definition) => definition.type === suggestionSourceNode.type)
    : undefined;
  const suggestionSourcePort =
    pendingConnection && suggestionSourceDefinition
      ? connectionOutputsFor(suggestionSourceDefinition).find(
          (port) => port.name === pendingConnection.sourcePort,
        )
      : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onDrop={handleDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
    >
      <ReactFlow<AutomationFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        minZoom={0.25}
        maxZoom={1.8}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeDoubleClick={(_, node) => openNodeDetail(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onNodeContextMenu={(event, node) => openContextMenu(event, { kind: 'node', id: node.id })}
        onEdgeContextMenu={(event, edge) => openContextMenu(event, { kind: 'edge', id: edge.id })}
        onPaneContextMenu={(event) => openContextMenu(event, { kind: 'canvas' })}
        onPaneClick={() => {
          setPendingConnection(null);
          selectEdge(null);
          closeNodeConfigDrawer();
        }}
        onNodeDragStop={(_, node: Node) =>
          execute({
            type: 'node.move',
            payload: { nodeId: node.id, position: node.position },
          })
        }
        onConnect={connect}
        onReconnect={reconnect}
        isValidConnection={isValidConnection}
        onConnectEnd={beginNodeSuggestion}
        onNodesDelete={(deleted) => {
          deleted.forEach((node) => onDeleteNode(node.id));
        }}
        onEdgesDelete={(deleted) =>
          deleted.forEach((edge) => execute({ type: 'edge.remove', payload: { edgeId: edge.id } }))
        }
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className="bg-editor-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1b4770" />
        <MiniMap
          pannable
          zoomable
          className="border! border-border! bg-panel!"
          nodeColor="var(--primary)"
          maskColor="rgb(2 6 13 / 72%)"
        />
        <Controls
          showInteractive={false}
          className="border-border! bg-panel! [&>button]:border-border! [&>button]:bg-panel! [&>button]:fill-foreground!"
        />
      </ReactFlow>
      {pendingConnection && suggestionSourcePort ? (
        <AddConnectedNodePanel
          sourcePort={suggestionSourcePort}
          catalog={catalog}
          position={pendingConnection.panelPosition}
          onChoose={addConnectedNode}
          onClose={() => setPendingConnection(null)}
        />
      ) : null}
    </div>
  );
}
