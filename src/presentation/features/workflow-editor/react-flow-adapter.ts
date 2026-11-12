import type { Edge, Node } from '@xyflow/react';

import type { WorkflowDocument } from '@domain/project/project';
import {
  connectionInputsFor,
  connectionOutputsFor,
  logicalOutputPortsFor,
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

export function connectionOutputHandlesFor(definition: NodeDefinition): readonly PortDefinition[] {
  const structuralOutputs = connectionOutputsFor(definition);
  if (definition.type === 'flow.start' || definition.type === 'trigger.start') {
    return structuralOutputs;
  }
  const template = structuralOutputs[0];
  if (!template) return [];
  return logicalOutputPortsFor(definition).map((name) => ({
    ...template,
    name,
    label: name === 'success' ? 'Success' : name === 'error' ? 'Error' : name,
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
      position: node.editor,
      selected: node.id === selectedNodeId,
      data: {
        displayName: node.name?.trim() || definition?.displayName || node.type,
        labelMode: node.labelMode ?? 'icon-and-name',
        icon: definition?.icon ?? 'workflow',
        nodeType: node.type,
        nodeVersion: definition?.version ?? 1,
        connectionInputs: definition ? connectionInputsFor(definition) : [],
        connectionOutputs: definition ? connectionOutputHandlesFor(definition) : [],
        issueCount: issues.filter((entry) => entry.nodeId === node.id).length,
        disabled: node.disabled ?? false,
      },
    };
  });
}

export function toReactFlowEdges(
  workflow: WorkflowDocument,
  catalog: readonly NodeDefinition[],
  selectedEdgeId?: string | null,
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
          ? '#22c55e'
          : 'var(--primary)';
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      sourceHandle: usesStructuralOutput ? 'out' : edge.sourcePort,
      target: edge.targetNodeId,
      targetHandle: edge.targetPort ?? 'in',
      selected: edge.id === selectedEdgeId,
      reconnectable: true,
      type: 'smoothstep',
      animated: false,
      style: { stroke, strokeWidth: 1.5 },
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
      editor: positions.get(node.id) ?? node.editor,
    })),
  };
}
