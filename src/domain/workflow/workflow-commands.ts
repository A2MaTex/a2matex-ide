import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import { WorkflowCommandError } from '@domain/workflow/workflow-command.error';
import type { WorkflowCommand } from '@domain/workflow/workflow-command.types';
import { validateObjectValue } from '@domain/schema/object-value-schema';
import { defaultNodeValuesFor, findNodeDefinition } from '@domain/workflow/node-catalog';
import {
  bindingInputsFor,
  connectionInputsFor,
  connectionOutputsFor,
  inputSchemaFor,
  logicalOutputPortsFor,
  logicalOutputPortsForNode,
  switchRules,
  type NodeDefinition,
  type PortDefinition,
} from '@domain/workflow/node-definition';
import { literalBinding, validateWorkflowBinding } from '@domain/workflow/workflow-binding';

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
  node?: WorkflowNode,
): PortDefinition {
  const ports =
    direction === 'input' ? connectionInputsFor(definition) : connectionOutputsFor(definition);
  const structuralPort = ports.find((candidate) => candidate.name === name);
  const port =
    structuralPort ??
    (direction === 'output' &&
    (node
      ? logicalOutputPortsForNode(definition, node)
      : logicalOutputPortsFor(definition)
    ).includes(name) &&
    ports[0]
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
  targetPort = 'in',
) {
  if (targetPort !== 'in') {
    throw new WorkflowCommandError(
      'PORT_NOT_FOUND',
      `Target port ${targetPort} cannot be persisted by this workflow version`,
    );
  }
  if (workflow.edges.some((candidate) => candidate.id === edge.id)) {
    throw new WorkflowCommandError('DUPLICATE_EDGE', 'Connection ID already exists');
  }
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
  const sourceDefinition = definitionFor(sourceNode, catalog);
  if (
    sourceDefinition.switch &&
    workflow.edges.some(
      (candidate) =>
        candidate.sourceNodeId === edge.sourceNodeId && candidate.sourcePort === edge.sourcePort,
    )
  ) {
    throw new WorkflowCommandError(
      'DUPLICATE_EDGE',
      'Each Switch branch may have only one outgoing connection',
    );
  }
  const output = portFor(sourceDefinition, 'output', edge.sourcePort, sourceNode);
  const input = portFor(definitionFor(targetNode, catalog), 'input', targetPort);
  if (!portsAreCompatible(output, input)) {
    throw new WorkflowCommandError('PORT_INCOMPATIBLE', 'The selected ports are incompatible');
  }
  if (wouldCreateCycle(workflow, edge.sourceNodeId, edge.targetNodeId)) {
    throw new WorkflowCommandError('GRAPH_CYCLE', 'This connection would create a cycle');
  }
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
          node.id === command.payload.nodeId
            ? { ...node, editor: { ...node.editor, ...command.payload.position } }
            : node,
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
      const inputSchema = inputSchemaFor(definition, command.payload.config);
      if (!inputSchema) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The selected target mode does not define an input schema',
        );
      }
      const configForValidation = definition.configSchema
        ? Object.fromEntries(
            Object.entries(command.payload.config).filter(([field]) =>
              Object.hasOwn(definition.configSchema!.properties, field),
            ),
          )
        : command.payload.config;
      const hasUnknownConfig = definition.configSchema
        ? Object.keys(command.payload.config).some(
            (field) =>
              !Object.hasOwn(definition.configSchema!.properties, field) &&
              !(definition.switch && field === 'rules'),
          )
        : false;
      if (
        hasUnknownConfig ||
        (definition.configSchema &&
          validateObjectValue(definition.configSchema, configForValidation).length > 0)
      ) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The node configuration values are invalid',
        );
      }
      const inputs = bindingInputsFor(definition, command.payload.config);
      if (definition.switch) {
        const rules = switchRules(command.payload.config);
        const rawRules = command.payload.config.rules;
        if (
          !Array.isArray(rawRules) ||
          rules.length !== rawRules.length ||
          rules.length < definition.switch.minimumRules ||
          rules.length > definition.switch.maximumRules ||
          new Set(rules.map(({ id }) => id)).size !== rules.length ||
          rules.some(
            (rule) => !definition.switch!.operators.some(({ value }) => value === rule.operator),
          )
        ) {
          throw new WorkflowCommandError(
            'INVALID_NODE_CONFIGURATION',
            'The Switch rules are invalid',
          );
        }
        for (const rule of rules) {
          const operator = definition.switch.operators.find(({ value }) => value === rule.operator);
          if (operator?.operandCount === 1) {
            inputs[rule.id] = { ...definition.switch.operand, name: rule.id };
          }
        }
      }
      const invalidBinding =
        Object.entries(inputs).some(
          ([field, input]) =>
            validateWorkflowBinding(command.payload.bindings[field], input).length > 0,
        ) || Object.keys(command.payload.bindings).some((field) => !Object.hasOwn(inputs, field));
      if (invalidBinding) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The node binding values are invalid',
        );
      }
      if (
        (command.payload.timeoutMs !== undefined &&
          (!Number.isInteger(command.payload.timeoutMs) ||
            command.payload.timeoutMs < 1 ||
            command.payload.timeoutMs > 600_000)) ||
        (command.payload.retryPolicy?.maxAttempts !== undefined &&
          (!Number.isInteger(command.payload.retryPolicy.maxAttempts) ||
            command.payload.retryPolicy.maxAttempts < 1 ||
            command.payload.retryPolicy.maxAttempts > 3)) ||
        (command.payload.retryPolicy?.delayMs !== undefined &&
          (!Number.isInteger(command.payload.retryPolicy.delayMs) ||
            command.payload.retryPolicy.delayMs < 0 ||
            command.payload.retryPolicy.delayMs > 60_000))
      ) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'The execution settings are invalid',
        );
      }
      if (
        command.payload.errorPolicy === 'ERROR_BRANCH' &&
        !logicalOutputPortsFor(definition).includes('error')
      ) {
        throw new WorkflowCommandError(
          'INVALID_NODE_CONFIGURATION',
          'This node does not support an error branch',
        );
      }
      const activePorts = new Set(
        logicalOutputPortsForNode(definition, {
          config: command.payload.config,
          errorPolicy: command.payload.errorPolicy,
        }),
      );
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === command.payload.nodeId
            ? {
                ...node,
                config: structuredClone(command.payload.config),
                bindings: structuredClone(command.payload.bindings),
                errorPolicy: command.payload.errorPolicy,
                ...(command.payload.timeoutMs === undefined
                  ? { timeoutMs: undefined }
                  : { timeoutMs: command.payload.timeoutMs }),
                ...(command.payload.retryPolicy
                  ? { retryPolicy: structuredClone(command.payload.retryPolicy) }
                  : { retryPolicy: undefined }),
              }
            : node,
        ),
        edges: workflow.edges.filter(
          (edge) => edge.sourceNodeId !== current.id || activePorts.has(edge.sourcePort),
        ),
      };
    }
    case 'node.updateMetadata': {
      findNode(workflow, command.payload.nodeId);
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
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === command.payload.nodeId
            ? {
                ...node,
                editor: {
                  x: node.editor.x,
                  y: node.editor.y,
                  ...(name ? { name } : {}),
                  labelMode: command.payload.labelMode,
                  ...(description ? { description } : {}),
                },
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
      const definition = definitionFor(source, catalog);
      if (workflow.nodes.some((node) => node.id === command.payload.nodeId)) {
        throw new WorkflowCommandError('DUPLICATE_NODE', 'Node ID already exists');
      }
      const sourcePosition = source.editor;
      const config = structuredClone(source.config);
      const bindings = structuredClone(source.bindings);
      if (definition.switch) {
        const rules = switchRules(config);
        const remappedRules = rules.map((rule) => {
          const id = globalThis.crypto.randomUUID();
          const operand = bindings[rule.id];
          delete bindings[rule.id];
          if (operand) bindings[id] = operand;
          return { ...rule, id };
        });
        config.rules = remappedRules;
      }
      return {
        ...workflow,
        nodes: [
          ...workflow.nodes,
          {
            ...source,
            id: command.payload.nodeId,
            config,
            bindings,
            editor: {
              ...source.editor,
              ...(command.payload.position ?? {
                x: sourcePosition.x + 48,
                y: sourcePosition.y + 48,
              }),
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
