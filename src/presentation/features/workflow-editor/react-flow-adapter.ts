import type { Edge, Node } from '@xyflow/react';

import type { WorkflowDocument } from '@domain/project/project';
import { findNodeDefinition } from '@domain/workflow/node-catalog';
import type { NodeDefinition, PortDefinition } from '@domain/workflow/node-definition';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';

export interface AutomationNodeData extends Record<string, unknown> {
  displayName: string;
  icon: string;
  nodeType: string;
  nodeVersion: number;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  issueCount: number;
}

export type AutomationFlowNode = Node<AutomationNodeData, 'automation'>;

export function toReactFlowNodes(
  workflow: WorkflowDocument,
  selectedNodeId: string | null,
  issues: readonly WorkflowIssue[],
  catalog: readonly NodeDefinition[],
): AutomationFlowNode[] {
  return workflow.nodes.map((node) => {
    const definition = findNodeDefinition(node.type, node.nodeVersion, catalog);
    return {
      id: node.id,
      type: 'automation',
      position: workflow.layout.nodes[node.id] ?? { x: 0, y: 0 },
      selected: node.id === selectedNodeId,
      data: {
        displayName: node.name ?? definition?.displayName ?? node.type,
        icon: definition?.icon ?? 'workflow',
        nodeType: node.type,
        nodeVersion: node.nodeVersion,
        inputs: definition?.inputs ?? [],
        outputs: definition?.outputs ?? [],
        issueCount: issues.filter((entry) => entry.nodeId === node.id).length,
      },
    };
  });
}

export function toReactFlowEdges(workflow: WorkflowDocument): Edge[] {
  return workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source.nodeId,
    sourceHandle: edge.source.port,
    target: edge.target.nodeId,
    targetHandle: edge.target.port,
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--primary)', strokeWidth: 1.5 },
  }));
}

export function applyReactFlowPositions(
  workflow: WorkflowDocument,
  nodes: readonly Pick<AutomationFlowNode, 'id' | 'position'>[],
): WorkflowDocument {
  const positions = { ...workflow.layout.nodes };
  for (const node of nodes) {
    if (workflow.nodes.some((candidate) => candidate.id === node.id)) {
      positions[node.id] = node.position;
    }
  }
  return {
    ...workflow,
    layout: {
      ...workflow.layout,
      nodes: positions,
    },
  };
}
