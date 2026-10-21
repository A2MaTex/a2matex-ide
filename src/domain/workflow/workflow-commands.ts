import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '../project/project.js';
import type { JsonValue } from '../../shared/types/json-value.js';
import { defaultParamsFor, findNodeDefinition } from './node-catalog.js';
import type { NodeDefinition, PortDefinition } from './node-definition.js';

export type WorkflowCommand =
  | {
      type: 'node.add';
      payload: {
        nodeId: string;
        nodeType: string;
        nodeVersion: number;
        position: { x: number; y: number };
      };
    }
  | {
      type: 'node.move';
      payload: { nodeId: string; position: { x: number; y: number } };
    }
  | {
      type: 'node.updateParams';
      payload: { nodeId: string; changes: Record<string, JsonValue> };
    }
  | { type: 'node.remove'; payload: { nodeId: string } }
  | {
      type: 'node.duplicate';
      payload: { sourceNodeId: string; nodeId: string; position?: { x: number; y: number } };
    }
  | {
      type: 'edge.connect';
      payload: {
        edgeId: string;
        source: { nodeId: string; port: string };
        target: { nodeId: string; port: string };
      };
    }
  | { type: 'edge.remove'; payload: { edgeId: string } };

export type WorkflowCommandErrorCode =
  | 'DUPLICATE_EDGE'
  | 'DUPLICATE_NODE'
  | 'EDGE_CARDINALITY'
  | 'GRAPH_CYCLE'
  | 'NODE_DEFINITION_MISSING'
  | 'NODE_NOT_FOUND'
  | 'PORT_INCOMPATIBLE'
  | 'PORT_NOT_FOUND';

export class WorkflowCommandError extends Error {
  readonly code: WorkflowCommandErrorCode;

  constructor(code: WorkflowCommandErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'WorkflowCommandError';
  }
}

function findNode(workflow: WorkflowDocument, nodeId: string) {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new WorkflowCommandError('NODE_NOT_FOUND', 'Workflow node was not found');
  return node;
}

function definitionFor(node: WorkflowNode, catalog: readonly NodeDefinition[]) {
  const definition = findNodeDefinition(node.type, node.nodeVersion, catalog);
  if (!definition) {
    throw new WorkflowCommandError(
      'NODE_DEFINITION_MISSING',
      'Node definition ' + node.type + '@' + node.nodeVersion + ' is unavailable',
    );
  }
  return definition;
}

function portFor(
  definition: NodeDefinition,
  direction: 'input' | 'output',
  name: string,
): PortDefinition {
  const port = (direction === 'input' ? definition.inputs : definition.outputs).find(
    (candidate) => candidate.name === name,
  );
  if (!port) {
    throw new WorkflowCommandError(
      'PORT_NOT_FOUND',
      direction + ' port ' + name + ' does not exist on ' + definition.displayName,
    );
  }
  return port;
}

function valueTypesEqual(left: PortDefinition['valueType'], right: PortDefinition['valueType']) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function wouldCreateCycle(workflow: WorkflowDocument, sourceNodeId: string, targetNodeId: string) {
  if (sourceNodeId === targetNodeId) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    const targets = outgoing.get(edge.source.nodeId) ?? [];
    targets.push(edge.target.nodeId);
    outgoing.set(edge.source.nodeId, targets);
  }
  const pending = [targetNodeId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (nodeId === sourceNodeId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(outgoing.get(nodeId) ?? []));
  }
  return false;
}

export function assertValidConnection(
  workflow: WorkflowDocument,
  edge: WorkflowEdge,
  catalog: readonly NodeDefinition[],
) {
  if (
    workflow.edges.some(
      (candidate) =>
        candidate.source.nodeId === edge.source.nodeId &&
        candidate.source.port === edge.source.port &&
        candidate.target.nodeId === edge.target.nodeId &&
        candidate.target.port === edge.target.port,
    )
  ) {
    throw new WorkflowCommandError('DUPLICATE_EDGE', 'This connection already exists');
  }

  const sourceNode = findNode(workflow, edge.source.nodeId);
  const targetNode = findNode(workflow, edge.target.nodeId);
  const output = portFor(definitionFor(sourceNode, catalog), 'output', edge.source.port);
  const input = portFor(definitionFor(targetNode, catalog), 'input', edge.target.port);
  if (output.kind !== input.kind || !valueTypesEqual(output.valueType, input.valueType)) {
    throw new WorkflowCommandError('PORT_INCOMPATIBLE', 'The selected ports are incompatible');
  }
  if (
    input.cardinality === 'one' &&
    workflow.edges.some(
      (candidate) =>
        candidate.target.nodeId === edge.target.nodeId &&
        candidate.target.port === edge.target.port,
    )
  ) {
    throw new WorkflowCommandError('EDGE_CARDINALITY', 'The input already has a connection');
  }
  if (
    output.cardinality === 'one' &&
    workflow.edges.some(
      (candidate) =>
        candidate.source.nodeId === edge.source.nodeId &&
        candidate.source.port === edge.source.port,
    )
  ) {
    throw new WorkflowCommandError('EDGE_CARDINALITY', 'The output already has a connection');
  }
  if (wouldCreateCycle(workflow, edge.source.nodeId, edge.target.nodeId)) {
    throw new WorkflowCommandError('GRAPH_CYCLE', 'This connection would create a cycle');
  }
}

export function applyWorkflowCommand(
  workflow: WorkflowDocument,
  command: WorkflowCommand,
  catalog: readonly NodeDefinition[],
): WorkflowDocument {
  switch (command.type) {
    case 'node.add': {
      if (workflow.nodes.some((node) => node.id === command.payload.nodeId)) {
        throw new WorkflowCommandError('DUPLICATE_NODE', 'Node ID already exists');
      }
      const definition = findNodeDefinition(
        command.payload.nodeType,
        command.payload.nodeVersion,
        catalog,
      );
      if (!definition) {
        throw new WorkflowCommandError('NODE_DEFINITION_MISSING', 'Node definition is unavailable');
      }
      return {
        ...workflow,
        nodes: [
          ...workflow.nodes,
          {
            id: command.payload.nodeId,
            type: definition.type,
            nodeVersion: definition.version,
            params: defaultParamsFor(definition),
          },
        ],
        layout: {
          ...workflow.layout,
          nodes: {
            ...workflow.layout.nodes,
            [command.payload.nodeId]: command.payload.position,
          },
        },
      };
    }
    case 'node.move': {
      findNode(workflow, command.payload.nodeId);
      return {
        ...workflow,
        layout: {
          ...workflow.layout,
          nodes: {
            ...workflow.layout.nodes,
            [command.payload.nodeId]: command.payload.position,
          },
        },
      };
    }
    case 'node.updateParams':
      findNode(workflow, command.payload.nodeId);
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === command.payload.nodeId
            ? { ...node, params: { ...node.params, ...command.payload.changes } }
            : node,
        ),
      };
    case 'node.remove': {
      findNode(workflow, command.payload.nodeId);
      const positions = { ...workflow.layout.nodes };
      delete positions[command.payload.nodeId];
      return {
        ...workflow,
        nodes: workflow.nodes.filter((node) => node.id !== command.payload.nodeId),
        edges: workflow.edges.filter(
          (edge) =>
            edge.source.nodeId !== command.payload.nodeId &&
            edge.target.nodeId !== command.payload.nodeId,
        ),
        layout: { ...workflow.layout, nodes: positions },
      };
    }
    case 'node.duplicate': {
      const source = findNode(workflow, command.payload.sourceNodeId);
      if (workflow.nodes.some((node) => node.id === command.payload.nodeId)) {
        throw new WorkflowCommandError('DUPLICATE_NODE', 'Node ID already exists');
      }
      const sourcePosition = workflow.layout.nodes[source.id] ?? { x: 0, y: 0 };
      return {
        ...workflow,
        nodes: [
          ...workflow.nodes,
          { ...source, id: command.payload.nodeId, params: structuredClone(source.params) },
        ],
        layout: {
          ...workflow.layout,
          nodes: {
            ...workflow.layout.nodes,
            [command.payload.nodeId]: command.payload.position ?? {
              x: sourcePosition.x + 48,
              y: sourcePosition.y + 48,
            },
          },
        },
      };
    }
    case 'edge.connect': {
      const edge = {
        id: command.payload.edgeId,
        source: command.payload.source,
        target: command.payload.target,
      };
      assertValidConnection(workflow, edge, catalog);
      return { ...workflow, edges: [...workflow.edges, edge] };
    }
    case 'edge.remove':
      return {
        ...workflow,
        edges: workflow.edges.filter((edge) => edge.id !== command.payload.edgeId),
      };
  }
}
