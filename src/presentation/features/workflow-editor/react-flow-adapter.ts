import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import {
  connectionInputsFor,
  connectionOutputsFor,
  logicalOutputPortsFor,
  logicalOutputPortsForNode,
  switchRules,
  type NodeDefinition,
  type PortDefinition,
} from '@domain/workflow/node-definition';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';

export interface AutomationNodeData extends Record<string, unknown> {
  displayName: string;
  labelMode: 'icon' | 'icon-and-name';
  icon: string;
  nodeType: string;
  nodeVersion: number;
  connectionInputs: readonly PortDefinition[];
  connectionOutputs: readonly PortDefinition[];
  issueCount: number;
}

export type AutomationFlowNode = Node<AutomationNodeData, 'automation'>;

export function selectedEdgeFromOutput(
  workflow: WorkflowDocument,
  selectedEdgeId: string | null,
  sourceNodeId: string,
  sourcePort: string,
): WorkflowEdge | undefined {
  if (!selectedEdgeId) return undefined;
  return workflow.edges.find(
    (edge) =>
      edge.id === selectedEdgeId &&
      edge.sourceNodeId === sourceNodeId &&
      edge.sourcePort === sourcePort,
  );
}

type ConnectionCommand = Extract<WorkflowCommand, { type: 'edge.connect' | 'edge.reconnect' }>;

export function connectionCommandFor(
  workflow: WorkflowDocument,
  selectedEdgeId: string | null,
  newEdgeId: string,
  source: { nodeId: string; port: string },
  target: { nodeId: string; port: string },
): ConnectionCommand {
  const selectedSourceEdge = selectedEdgeFromOutput(
    workflow,
    selectedEdgeId,
    source.nodeId,
    source.port,
  );
  return selectedSourceEdge
    ? {
        type: 'edge.reconnect',
        payload: { edgeId: selectedSourceEdge.id, source, target },
      }
    : {
        type: 'edge.connect',
        payload: { edgeId: newEdgeId, source, target },
      };
}

export function connectionOutputHandlesFor(
  definition: NodeDefinition,
  node?: WorkflowNode,
): readonly PortDefinition[] {
  const structuralOutputs = connectionOutputsFor(definition);
  if (definition.type === 'flow.start' || definition.type === 'trigger.start') {
    return structuralOutputs;
  }
  const template = structuralOutputs[0];
  if (!template) return [];
  const switchLabels = new Map(
    switchRules(node?.config ?? {}).map((rule, index) => [
      rule.id,
      `Rule ${index + 1}: ${rule.operator}`,
    ]),
  );
  const ports = node
    ? logicalOutputPortsForNode(definition, node)
    : logicalOutputPortsFor(definition);
  return ports.map((name) => ({
    ...template,
    name,
    label:
      name === 'success'
        ? 'Success'
        : name === 'error'
          ? 'Error'
          : name === 'default'
            ? 'Default'
            : (switchLabels.get(name) ?? name),
  }));
}

export function toReactFlowNodes(
  workflow: WorkflowDocument,
  selectedNodeId: string | null,
  issues: readonly WorkflowIssue[],
  catalog: readonly NodeDefinition[],
): AutomationFlowNode[] {
  return workflow.nodes.map((node) => {
    const definition = catalog.find((candidate) => candidate.type === node.type);
    return {
      id: node.id,
      type: 'automation',
      position: { x: node.editor.x, y: node.editor.y },
      selected: node.id === selectedNodeId,
      data: {
        displayName: node.editor.name?.trim() || definition?.displayName || node.type,
        labelMode: node.editor.labelMode ?? 'icon-and-name',
        icon: definition?.icon ?? 'workflow',
        nodeType: node.type,
        nodeVersion: definition?.version ?? 1,
        connectionInputs: definition ? connectionInputsFor(definition) : [],
        connectionOutputs: definition ? connectionOutputHandlesFor(definition, node) : [],
        issueCount: issues.filter((entry) => entry.nodeId === node.id).length,
      },
    };
  });
}

export function toReactFlowEdges(
  workflow: WorkflowDocument,
  catalog: readonly NodeDefinition[],
  selectedEdgeId?: string | null,
  reconnectingEdgeId?: string | null,
): Edge[] {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  return workflow.edges.map((edge) => {
    const source = nodes.get(edge.sourceNodeId);
    const definition = source
      ? catalog.find((candidate) => candidate.type === source.type)
      : undefined;
    const usesStructuralOutput =
      definition?.type === 'flow.start' || definition?.type === 'trigger.start';
    const stroke =
      edge.sourcePort === 'error'
        ? '#ef4444'
        : edge.sourcePort === 'success'
          ? '#8ca6c4'
          : 'var(--primary)';
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      sourceHandle: usesStructuralOutput ? 'out' : edge.sourcePort,
      target: edge.targetNodeId,
      targetHandle: 'in',
      selected: edge.id === selectedEdgeId,
      reconnectable: true,
      interactionWidth: 24,
      type: 'default',
      pathOptions: { curvature: 0.8 },
      animated: edge.id !== reconnectingEdgeId,
      className: 'workflow-edge',
      ariaLabel: `Connection from ${edge.sourceNodeId} to ${edge.targetNodeId}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 18,
        height: 18,
      },
      zIndex: edge.id === selectedEdgeId ? 1 : 0,
      style: {
        stroke,
        strokeWidth: edge.id === selectedEdgeId ? 2.5 : 1.5,
        opacity: edge.id === reconnectingEdgeId ? 0 : 1,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    };
  });
}

export function applyReactFlowPositions(
  workflow: WorkflowDocument,
  nodes: readonly Pick<AutomationFlowNode, 'id' | 'position'>[],
): WorkflowDocument {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      editor: { ...node.editor, ...(positions.get(node.id) ?? {}) },
    })),
  };
}
