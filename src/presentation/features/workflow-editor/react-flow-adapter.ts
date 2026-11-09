import type { Edge, Node } from '@xyflow/react';

import type { WorkflowDocument } from '@domain/project/project';
import {
  connectionInputsFor,
  connectionOutputsFor,
  type NodeDefinition,
  type PortDefinition,
} from '@domain/workflow/node-definition';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';

export interface AutomationNodeData extends Record<string, unknown> {
  displayName: string;
  labelMode: 'icon' | 'icon-and-name';
  icon: string;
  nodeType: string;
  nodeVersion: number;
  connectionInputs: readonly PortDefinition[];
  connectionOutputs: readonly PortDefinition[];
  issueCount: number;
  disabled: boolean;
}

export type AutomationFlowNode = Node<AutomationNodeData, 'automation'>;

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
      position: node.editor,
      selected: node.id === selectedNodeId,
      data: {
        displayName: node.name?.trim() || definition?.displayName || node.type,
        labelMode: node.labelMode ?? 'icon-and-name',
        icon: definition?.icon ?? 'workflow',
        nodeType: node.type,
        nodeVersion: definition?.version ?? 1,
        connectionInputs: definition ? connectionInputsFor(definition) : [],
        connectionOutputs: definition ? connectionOutputsFor(definition) : [],
        issueCount: issues.filter((entry) => entry.nodeId === node.id).length,
        disabled: node.disabled ?? false,
      },
    };
  });
}

export function toReactFlowEdges(
  workflow: WorkflowDocument,
  selectedEdgeId?: string | null,
): Edge[] {
  return workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    // The canvas exposes one structural handle per direction. Stored legacy port
    // names remain intact until the edge is explicitly reconnected.
    sourceHandle: 'out',
    target: edge.targetNodeId,
    targetHandle: 'in',
    selected: edge.id === selectedEdgeId,
    reconnectable: true,
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--primary)', strokeWidth: 1.5 },
  }));
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
      editor: positions.get(node.id) ?? node.editor,
    })),
  };
}
