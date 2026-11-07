import type { Edge, Node } from '@xyflow/react';

import type { WorkflowDocument } from '@domain/project/project';
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
    const definition = catalog.find((candidate) => candidate.type === node.type);
    return {
      id: node.id,
      type: 'automation',
      position: node.editor,
      selected: node.id === selectedNodeId,
      data: {
        displayName: definition?.displayName ?? node.type,
        icon: definition?.icon ?? 'workflow',
        nodeType: node.type,
        nodeVersion: definition?.version ?? 1,
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
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePort,
    target: edge.targetNodeId,
    targetHandle: 'in',
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
