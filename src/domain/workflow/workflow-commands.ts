import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import { defaultNodeValuesFor, findNodeDefinition } from '@domain/workflow/node-catalog';
import type { NodeDefinition, PortDefinition } from '@domain/workflow/node-definition';
import type { JsonValue } from '@shared/types/json-value';

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
  const definition = catalog.find((candidate) => candidate.type === node.type);
  if (!definition) {
    throw new WorkflowCommandError(
      'NODE_DEFINITION_MISSING',
      'Node definition ' + node.type + ' is unavailable',
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
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
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
  targetPort = 'in',
) {
  if (
    workflow.edges.some(
      (candidate) =>
        candidate.sourceNodeId === edge.sourceNodeId &&
        candidate.sourcePort === edge.sourcePort &&
        candidate.targetNodeId === edge.targetNodeId,
    )
  ) {
    throw new WorkflowCommandError('DUPLICATE_EDGE', 'This connection already exists');
  }

  const sourceNode = findNode(workflow, edge.sourceNodeId);
  const targetNode = findNode(workflow, edge.targetNodeId);
  const output = portFor(definitionFor(sourceNode, catalog), 'output', edge.sourcePort);
  const input = portFor(definitionFor(targetNode, catalog), 'input', targetPort);
  if (output.kind !== input.kind || !valueTypesEqual(output.valueType, input.valueType)) {
    throw new WorkflowCommandError('PORT_INCOMPATIBLE', 'The selected ports are incompatible');
  }
  if (
    input.cardinality === 'one' &&
    workflow.edges.some((candidate) => candidate.targetNodeId === edge.targetNodeId)
  ) {
    throw new WorkflowCommandError('EDGE_CARDINALITY', 'The input already has a connection');
  }
  if (
    output.cardinality === 'one' &&
    workflow.edges.some(
      (candidate) =>
        candidate.sourceNodeId === edge.sourceNodeId && candidate.sourcePort === edge.sourcePort,
    )
  ) {
    throw new WorkflowCommandError('EDGE_CARDINALITY', 'The output already has a connection');
  }
  if (wouldCreateCycle(workflow, edge.sourceNodeId, edge.targetNodeId)) {
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
      const defaults = defaultNodeValuesFor(definition);
      const node = {
        id: command.payload.nodeId,
        type: definition.type,
        config: defaults.config,
        editor: command.payload.position,
        bindings: defaults.bindings,
        errorPolicy: 'STOP' as const,
      };
      return {
        ...workflow,
        entryNodeId:
          workflow.entryNodeId || definition.type !== 'flow.start'
            ? workflow.entryNodeId
            : command.payload.nodeId,
        nodes: [...workflow.nodes, node],
      };
    }
    case 'node.move': {
      findNode(workflow, command.payload.nodeId);
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === command.payload.nodeId ? { ...node, editor: command.payload.position } : node,
        ),
      };
    }
    case 'node.updateParams': {
      const current = findNode(workflow, command.payload.nodeId);
      const definition = definitionFor(current, catalog);
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) => {
          if (node.id !== command.payload.nodeId) return node;
          const config = { ...node.config };
          const bindings = structuredClone(node.bindings);
          for (const [name, value] of Object.entries(command.payload.changes)) {
            const property = definition.properties.properties[name];
            if (property?.storage === 'config') config[name] = value;
            else bindings[name] = { kind: 'constant', value };
          }
          return { ...node, config, bindings };
        }),
      };
    }
    case 'node.remove': {
      findNode(workflow, command.payload.nodeId);
      return {
        ...workflow,
        entryNodeId: workflow.entryNodeId === command.payload.nodeId ? '' : workflow.entryNodeId,
        nodes: workflow.nodes.filter((node) => node.id !== command.payload.nodeId),
        edges: workflow.edges.filter(
          (edge) =>
            edge.sourceNodeId !== command.payload.nodeId &&
            edge.targetNodeId !== command.payload.nodeId,
        ),
      };
    }
    case 'node.duplicate': {
      const source = findNode(workflow, command.payload.sourceNodeId);
      if (workflow.nodes.some((node) => node.id === command.payload.nodeId)) {
        throw new WorkflowCommandError('DUPLICATE_NODE', 'Node ID already exists');
      }
      const sourcePosition = source.editor;
      return {
        ...workflow,
        nodes: [
          ...workflow.nodes,
          {
            ...source,
            id: command.payload.nodeId,
            config: structuredClone(source.config),
            bindings: structuredClone(source.bindings),
            editor: command.payload.position ?? {
              x: sourcePosition.x + 48,
              y: sourcePosition.y + 48,
            },
          },
        ],
      };
    }
    case 'edge.connect': {
      const edge = {
        id: command.payload.edgeId,
        sourcePort: command.payload.source.port,
        sourceNodeId: command.payload.source.nodeId,
        targetNodeId: command.payload.target.nodeId,
      };
      assertValidConnection(workflow, edge, catalog, command.payload.target.port);
      return { ...workflow, edges: [...workflow.edges, edge] };
    }
    case 'edge.remove':
      return {
        ...workflow,
        edges: workflow.edges.filter((edge) => edge.id !== command.payload.edgeId),
      };
  }
}
