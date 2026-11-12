import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import { WorkflowCommandError } from '@domain/workflow/workflow-command.error';
import type { WorkflowCommand } from '@domain/workflow/workflow-command.types';
import {
  fieldValueIsValid,
  objectValueSchemasEqual,
  objectValueSchema,
  validateObjectValue,
} from '@domain/schema/object-value-schema';
import { defaultNodeValuesFor, findNodeDefinition } from '@domain/workflow/node-catalog';
import {
  connectionInputsFor,
  connectionOutputsFor,
  logicalOutputPortsFor,
  type NodeDefinition,
  type PortDefinition,
} from '@domain/workflow/node-definition';
import { isLiteralBinding, literalBinding } from '@domain/workflow/workflow-binding';

export { WorkflowCommandError } from '@domain/workflow/workflow-command.error';
export type { WorkflowCommandErrorCode } from '@domain/workflow/workflow-command.error';
export type { WorkflowCommand } from '@domain/workflow/workflow-command.types';

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
  const ports =
    direction === 'input' ? connectionInputsFor(definition) : connectionOutputsFor(definition);
  const structuralPort = ports.find((candidate) => candidate.name === name);
  const port =
    structuralPort ??
    (direction === 'output' && logicalOutputPortsFor(definition).includes(name) && ports[0]
      ? { ...ports[0], name }
      : undefined);
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

export function portsAreCompatible(source: PortDefinition, target: PortDefinition) {
  return (
    source.direction === 'output' &&
    target.direction === 'input' &&
    source.kind === target.kind &&
    valueTypesEqual(source.valueType, target.valueType)
  );
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
  targetPort = edge.targetPort ?? 'in',
) {
  if (workflow.edges.some((candidate) => candidate.id === edge.id)) {
    throw new WorkflowCommandError('DUPLICATE_EDGE', 'Connection ID already exists');
  }
  if (
    workflow.edges.some(
      (candidate) =>
        candidate.sourceNodeId === edge.sourceNodeId &&
        candidate.sourcePort === edge.sourcePort &&
        candidate.targetNodeId === edge.targetNodeId &&
        (candidate.targetPort ?? 'in') === targetPort,
    )
  ) {
    throw new WorkflowCommandError('DUPLICATE_EDGE', 'This connection already exists');
  }

  const sourceNode = findNode(workflow, edge.sourceNodeId);
  const targetNode = findNode(workflow, edge.targetNodeId);
  const output = portFor(definitionFor(sourceNode, catalog), 'output', edge.sourcePort);
  const input = portFor(definitionFor(targetNode, catalog), 'input', targetPort);
  if (!portsAreCompatible(output, input)) {
    throw new WorkflowCommandError('PORT_INCOMPATIBLE', 'The selected ports are incompatible');
  }
  if (wouldCreateCycle(workflow, edge.sourceNodeId, edge.targetNodeId)) {
    throw new WorkflowCommandError('GRAPH_CYCLE', 'This connection would create a cycle');
  }
}

export function canDisableNode(definition: NodeDefinition) {
  if (definition.type === 'flow.start') return false;
  const controlInputs = connectionInputsFor(definition).filter((port) => port.kind === 'control');
  const controlOutputs = connectionOutputsFor(definition).filter((port) => port.kind === 'control');
  return controlInputs.length === 1 && controlOutputs.length === 1;
}

function createNode(
  nodeId: string,
  definition: NodeDefinition,
  position: { x: number; y: number },
): WorkflowNode {
  const defaults = defaultNodeValuesFor(definition);
  return {
    id: nodeId,
    type: definition.type,
    config: defaults.config,
    inputSchema: structuredClone(
      definition.instanceInputSchema ?? {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    ),
    editor: position,
    bindings: defaults.bindings,
    errorPolicy: 'STOP',
  };
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
      const node = createNode(command.payload.nodeId, definition, command.payload.position);
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
            else bindings[name] = literalBinding(value);
          }
          return { ...node, config, bindings };
        }),
      };
    }
    case 'node.commitConfiguration': {
      const current = findNode(workflow, command.payload.nodeId);
      const definition = definitionFor(current, catalog);
      const parsedSchema = objectValueSchema.safeParse(command.payload.inputSchema);
      if (!parsedSchema.success) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The node input schema is invalid',
        );
      }
      if (!definition.supportedErrorPolicies.includes(command.payload.errorPolicy)) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The selected error policy is not supported',
        );
      }
      if (
        definition.configSchema &&
        validateObjectValue(definition.configSchema, command.payload.config).length > 0
      ) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The node configuration values are invalid',
        );
      }
      const invalidBinding =
        parsedSchema.data.required.some((field) => !command.payload.bindings[field]) ||
        Object.entries(command.payload.bindings).some(([field, binding]) => {
          const property = parsedSchema.data.properties[field];
          return (
            !property || (isLiteralBinding(binding) && !fieldValueIsValid(property, binding.value))
          );
        });
      if (invalidBinding) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The node binding values are invalid',
        );
      }
      if (definition.targeting) {
        const targetMode = command.payload.config.targetMode;
        const mode =
          typeof targetMode === 'string'
            ? definition.targeting.modes.find((entry) => entry.mode === targetMode)
            : undefined;
        if (!mode || !objectValueSchemasEqual(mode.bindingSchema, parsedSchema.data)) {
          throw new WorkflowCommandError(
            'INVALID_NODE_CONFIGURATION',
            'The selected target mode does not match the input schema',
          );
        }
      }
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === command.payload.nodeId
            ? {
                ...node,
                config: structuredClone(command.payload.config),
                inputSchema: structuredClone(parsedSchema.data),
                bindings: structuredClone(command.payload.bindings),
                errorPolicy: command.payload.errorPolicy,
              }
            : node,
        ),
      };
    }
    case 'node.updateMetadata': {
      const current = findNode(workflow, command.payload.nodeId);
      const definition = definitionFor(current, catalog);
      const name = command.payload.name?.trim() || undefined;
      const description = command.payload.description?.replace(/\r\n/g, '\n').trim() || undefined;
      if (name && name.length > 100) {
        throw new WorkflowCommandError(
          'INVALID_NODE_METADATA',
          'Node name must not exceed 100 characters',
        );
      }
      if (description && description.length > 20_000) {
        throw new WorkflowCommandError(
          'INVALID_NODE_METADATA',
          'Node description must not exceed 20,000 characters',
        );
      }
      if (command.payload.disabled && !canDisableNode(definition)) {
        throw new WorkflowCommandError(
          'INVALID_NODE_METADATA',
          'This node does not declare safe disable behavior',
        );
      }
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === command.payload.nodeId
            ? {
                ...node,
                ...(name ? { name } : { name: undefined }),
                labelMode: command.payload.labelMode,
                ...(description ? { description } : { description: undefined }),
                disabled: command.payload.disabled,
              }
            : node,
        ),
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
            inputSchema: structuredClone(source.inputSchema),
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
        targetPort: command.payload.target.port,
        targetNodeId: command.payload.target.nodeId,
      };
      assertValidConnection(workflow, edge, catalog, command.payload.target.port);
      return { ...workflow, edges: [...workflow.edges, edge] };
    }
    case 'node.addConnected': {
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
      const node = createNode(command.payload.nodeId, definition, command.payload.position);
      const candidate = { ...workflow, nodes: [...workflow.nodes, node] };
      const edge = {
        id: command.payload.edgeId,
        sourcePort: command.payload.source.port,
        sourceNodeId: command.payload.source.nodeId,
        targetPort: command.payload.targetPort,
        targetNodeId: command.payload.nodeId,
      };
      assertValidConnection(candidate, edge, catalog, command.payload.targetPort);
      return { ...candidate, edges: [...candidate.edges, edge] };
    }
    case 'edge.reconnect': {
      const edgeIndex = workflow.edges.findIndex((edge) => edge.id === command.payload.edgeId);
      if (edgeIndex < 0) {
        throw new WorkflowCommandError('EDGE_NOT_FOUND', 'Connection was not found');
      }
      const edge = {
        id: command.payload.edgeId,
        sourcePort: command.payload.source.port,
        sourceNodeId: command.payload.source.nodeId,
        targetPort: command.payload.target.port,
        targetNodeId: command.payload.target.nodeId,
      };
      const withoutOriginal = {
        ...workflow,
        edges: workflow.edges.filter((candidate) => candidate.id !== command.payload.edgeId),
      };
      assertValidConnection(withoutOriginal, edge, catalog, command.payload.target.port);
      const edges = [...workflow.edges];
      edges[edgeIndex] = edge;
      return { ...workflow, edges };
    }
    case 'edge.remove':
      return {
        ...workflow,
        edges: workflow.edges.filter((edge) => edge.id !== command.payload.edgeId),
      };
  }
}
