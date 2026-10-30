import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, type DragEvent } from 'react';

import type { WorkflowDocument } from '@domain/project/project';
import { findNodeDefinition } from '@domain/workflow/node-catalog';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { assertValidConnection, type WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import { useEditorStore } from '@presentation/stores/editor-store';

import { AutomationNode } from '@presentation/features/workflow-editor/AutomationNode';
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
}

const nodeTypes = { automation: AutomationNode };

function nextNodeId(type: string) {
  return type.replace(/[^a-z0-9]+/gi, '-') + '-' + crypto.randomUUID().slice(0, 8);
}

export function WorkflowCanvas({ catalog, workflow, issues, execute }: WorkflowCanvasProps) {
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectNode = useEditorStore((state) => state.selectNode);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const nodes = useMemo(
    () => toReactFlowNodes(workflow, selectedNodeId, issues, catalog),
    [catalog, issues, selectedNodeId, workflow],
  );
  const edges = useMemo(() => toReactFlowEdges(workflow), [workflow]);

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
          source: { nodeId: connection.source, port: connection.sourceHandle },
          target: { nodeId: connection.target, port: connection.targetHandle },
        },
        catalog,
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

  return (
    <div
      className="h-full w-full"
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
        onPaneClick={() => selectNode(null)}
        onNodeDragStop={(_, node: Node) =>
          execute({
            type: 'node.move',
            payload: { nodeId: node.id, position: node.position },
          })
        }
        onConnect={connect}
        isValidConnection={isValidConnection}
        onConnectEnd={(_, state) => {
          if (state.isValid !== false || !state.fromHandle || !state.toHandle) return;
          const source = state.fromHandle.type === 'source' ? state.fromHandle : state.toHandle;
          const target = state.fromHandle.type === 'target' ? state.fromHandle : state.toHandle;
          if (source.type !== 'source' || target.type !== 'target' || !source.id || !target.id) {
            return;
          }
          execute({
            type: 'edge.connect',
            payload: {
              edgeId: 'rejected-' + crypto.randomUUID().slice(0, 8),
              source: { nodeId: source.nodeId, port: source.id },
              target: { nodeId: target.nodeId, port: target.id },
            },
          });
        }}
        onNodesDelete={(deleted) => {
          deleted.forEach((node) => execute({ type: 'node.remove', payload: { nodeId: node.id } }));
          selectNode(null);
        }}
        onEdgesDelete={(deleted) =>
          deleted.forEach((edge) => execute({ type: 'edge.remove', payload: { edgeId: edge.id } }))
        }
        deleteKeyCode={['Backspace', 'Delete']}
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
    </div>
  );
}
