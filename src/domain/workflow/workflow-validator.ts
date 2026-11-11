import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import {
  fieldValueIsValid,
  objectValueSchemasEqual,
  validateObjectValue,
} from '@domain/schema/object-value-schema';
import {
  ANDROID_SELECTOR_V1_FORMAT,
  isAndroidSelectorV1,
} from '@domain/android-inspector/android-selector';
import {
  connectionInputsFor,
  connectionOutputsFor,
  logicalOutputPortsFor,
  type NodeDefinition,
  type PropertyDefinition,
} from '@domain/workflow/node-definition';
import { canDisableNode } from '@domain/workflow/workflow-commands';
import { isLiteralBinding } from '@domain/workflow/workflow-binding';

export interface WorkflowIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  workflowId: string;
  nodeId?: string;
  edgeId?: string;
  propertyPath?: string;
}

function issue(
  workflow: WorkflowDocument,
  code: string,
  message: string,
  target: Pick<WorkflowIssue, 'nodeId' | 'edgeId' | 'propertyPath'> = {},
): WorkflowIssue {
  const path = target.propertyPath ?? target.edgeId ?? target.nodeId ?? 'workflow';
  return {
    id: [workflow.entryNodeId || 'workflow', code, path].join(':'),
    severity: 'error',
    code,
    message,
    workflowId: workflow.entryNodeId || 'workflow',
    ...target,
  };
}

function propertyValueIsValid(value: unknown, property: PropertyDefinition) {
  if (property.format === ANDROID_SELECTOR_V1_FORMAT) return isAndroidSelectorV1(value);
  switch (property.type) {
    case 'string':
      if (typeof value !== 'string') return false;
      if (property.pattern && !new RegExp(property.pattern).test(value)) return false;
      return !property.enum || property.enum.some((entry) => Object.is(entry, value));
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      if (property.type === 'integer' && !Number.isInteger(value)) return false;
      if (property.minimum !== undefined && value < property.minimum) return false;
      if (property.maximum !== undefined && value > property.maximum) return false;
      return !property.enum || property.enum.some((entry) => Object.is(entry, value));
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}

function validateNodeProperties(
  workflow: WorkflowDocument,
  node: WorkflowNode,
  definition: NodeDefinition,
) {
  if (definition.configSchema) {
    const issues: WorkflowIssue[] = validateObjectValue(definition.configSchema, node.config).map(
      (entry) =>
        issue(
          workflow,
          entry.code === 'required' ? 'PROPERTY_REQUIRED' : 'PROPERTY_INVALID',
          entry.message,
          { nodeId: node.id, propertyPath: `config.${entry.field}` },
        ),
    );
    for (const field of node.inputSchema.required) {
      if (!node.bindings[field]) {
        issues.push(
          issue(workflow, 'PROPERTY_REQUIRED', `${field} is required`, {
            nodeId: node.id,
            propertyPath: `bindings.${field}`,
          }),
        );
      }
    }
    for (const [field, binding] of Object.entries(node.bindings)) {
      const property = node.inputSchema.properties[field];
      if (!property) {
        issues.push(
          issue(workflow, 'PROPERTY_UNKNOWN', `${field} is not supported by the selected schema`, {
            nodeId: node.id,
            propertyPath: `bindings.${field}`,
          }),
        );
      } else if (isLiteralBinding(binding) && !fieldValueIsValid(property, binding.value)) {
        issues.push(
          issue(workflow, 'PROPERTY_INVALID', `${field} has an invalid value`, {
            nodeId: node.id,
            propertyPath: `bindings.${field}`,
          }),
        );
      }
    }
    if (definition.targeting) {
      const targetMode = node.config.targetMode;
      const selected =
        typeof targetMode === 'string'
          ? definition.targeting.modes.find(({ mode }) => mode === targetMode)
          : undefined;
      if (!selected || !objectValueSchemasEqual(selected.bindingSchema, node.inputSchema)) {
        issues.push(
          issue(
            workflow,
            'INPUT_SCHEMA_MODE_MISMATCH',
            'The node input schema does not match its selected target mode',
            { nodeId: node.id, propertyPath: 'inputSchema' },
          ),
        );
      }
    }
    return issues;
  }

  const issues: WorkflowIssue[] = [];
  for (const required of definition.properties.required ?? []) {
    const property = definition.properties.properties[required];
    const stored =
      property?.storage === 'config'
        ? node.config[required]
        : isLiteralBinding(node.bindings[required])
          ? node.bindings[required].value
          : node.bindings[required];
    if (stored === undefined || stored === '') {
      issues.push(
        issue(workflow, 'PROPERTY_REQUIRED', required + ' is required', {
          nodeId: node.id,
          propertyPath: (property?.storage === 'config' ? 'config.' : 'bindings.') + required,
        }),
      );
    }
  }
  const values = [
    ...Object.entries(node.config).map(([name, value]) => [name, value, 'config'] as const),
    ...Object.entries(node.bindings).map(
      ([name, binding]) =>
        [name, isLiteralBinding(binding) ? binding.value : binding, 'binding'] as const,
    ),
  ];
  for (const [name, value, storage] of values) {
    const property = definition.properties.properties[name];
    if (!property || property.storage !== storage) {
      issues.push(
        issue(workflow, 'PROPERTY_UNKNOWN', name + ' is not supported by this node version', {
          nodeId: node.id,
          propertyPath: (storage === 'config' ? 'config.' : 'bindings.') + name,
        }),
      );
      continue;
    }
    if (!propertyValueIsValid(value, property)) {
      issues.push(
        issue(workflow, 'PROPERTY_INVALID', property.title + ' has an invalid value', {
          nodeId: node.id,
          propertyPath: (storage === 'config' ? 'config.' : 'bindings.') + name,
        }),
      );
    }
  }
  return issues;
}

function validateEdge(
  workflow: WorkflowDocument,
  edge: WorkflowEdge,
  nodes: Map<string, WorkflowNode>,
  definitions: Map<string, NodeDefinition>,
) {
  const issues: WorkflowIssue[] = [];
  const source = nodes.get(edge.sourceNodeId);
  const target = nodes.get(edge.targetNodeId);
  if (!source || !target) {
    return [
      issue(workflow, 'EDGE_NODE_MISSING', 'Connection references a missing node', {
        edgeId: edge.id,
      }),
    ];
  }
  const sourceDefinition = definitions.get(source.id);
  const targetDefinition = definitions.get(target.id);
  if (!sourceDefinition || !targetDefinition) return issues;
  const sourcePorts = connectionOutputsFor(sourceDefinition);
  const targetPorts = connectionInputsFor(targetDefinition);
  const output =
    logicalOutputPortsFor(sourceDefinition).includes(edge.sourcePort) && sourcePorts[0]
      ? { ...sourcePorts[0], name: edge.sourcePort }
      : undefined;
  const input = targetPorts.find((port) => port.name === (edge.targetPort ?? 'in'));
  if (!output || !input) {
    issues.push(
      issue(workflow, 'EDGE_PORT_MISSING', 'Connection references a missing port', {
        edgeId: edge.id,
      }),
    );
  } else if (
    output.kind !== input.kind ||
    JSON.stringify(output.valueType) !== JSON.stringify(input.valueType)
  ) {
    issues.push(
      issue(workflow, 'EDGE_TYPE_INCOMPATIBLE', 'Connection ports have incompatible types', {
        edgeId: edge.id,
      }),
    );
  }
  return issues;
}

function cycleNodeIds(workflow: WorkflowDocument) {
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      cyclic.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      visit(target);
      if (cyclic.has(target)) cyclic.add(nodeId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  workflow.nodes.forEach((node) => visit(node.id));
  return cyclic;
}

export function validateWorkflow(
  workflow: WorkflowDocument,
  catalog: readonly NodeDefinition[],
  manifestPermissions: readonly string[] = [],
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const nodes = new Map<string, WorkflowNode>();
  const definitions = new Map<string, NodeDefinition>();

  for (const node of workflow.nodes) {
    if (nodes.has(node.id)) {
      issues.push(
        issue(workflow, 'NODE_ID_DUPLICATE', 'Node ID ' + node.id + ' is duplicated', {
          nodeId: node.id,
        }),
      );
      continue;
    }
    nodes.set(node.id, node);
    const definition = catalog.find((candidate) => candidate.type === node.type);
    if (!definition) {
      issues.push(
        issue(workflow, 'NODE_DEFINITION_MISSING', node.type + ' is unavailable', {
          nodeId: node.id,
        }),
      );
      continue;
    }
    definitions.set(node.id, definition);
    issues.push(
      ...validateNodeProperties(workflow, node, definition).map((entry) =>
        node.disabled ? { ...entry, severity: 'warning' as const } : entry,
      ),
    );
    if (node.disabled && !canDisableNode(definition)) {
      issues.push(
        issue(workflow, 'DISABLED_BEHAVIOR_UNSUPPORTED', 'This node cannot be safely disabled', {
          nodeId: node.id,
        }),
      );
    }
    if (node.disabled) continue;
    for (const permission of definition.requiredPermissions) {
      if (!manifestPermissions.includes(permission)) {
        issues.push(
          issue(workflow, 'PERMISSION_MISSING', 'Manifest must declare ' + permission, {
            nodeId: node.id,
          }),
        );
      }
    }
  }

  const entry = nodes.get(workflow.entryNodeId);
  if (!entry || entry.type !== 'flow.start') {
    issues.push(
      issue(workflow, 'ENTRY_NODE_INVALID', 'entryNodeId must reference a flow.start node'),
    );
  }

  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push(
        issue(workflow, 'EDGE_ID_DUPLICATE', 'Edge ID ' + edge.id + ' is duplicated', {
          edgeId: edge.id,
        }),
      );
    }
    edgeIds.add(edge.id);
    const key =
      edge.sourceNodeId +
      ':' +
      edge.sourcePort +
      '->' +
      edge.targetNodeId +
      ':' +
      (edge.targetPort ?? 'in');
    if (edgeKeys.has(key)) {
      issues.push(
        issue(workflow, 'EDGE_DUPLICATE', 'Connection is duplicated', { edgeId: edge.id }),
      );
    }
    edgeKeys.add(key);
    issues.push(...validateEdge(workflow, edge, nodes, definitions));
  }

  for (const node of workflow.nodes) {
    const definition = definitions.get(node.id);
    if (!definition) continue;
    const errorEdges = workflow.edges.filter(
      (edge) => edge.sourceNodeId === node.id && edge.sourcePort === 'error',
    );
    if (!definition.supportedErrorPolicies.includes(node.errorPolicy)) {
      issues.push(
        issue(workflow, 'ERROR_POLICY_UNSUPPORTED', 'This node does not support its error policy', {
          nodeId: node.id,
        }),
      );
    } else if (node.errorPolicy === 'ERROR_BRANCH' && errorEdges.length === 0) {
      issues.push(
        issue(workflow, 'ERROR_ROUTE_REQUIRED', 'Error Branch requires an error connection', {
          nodeId: node.id,
        }),
      );
    } else if (node.errorPolicy === 'STOP' && errorEdges.length > 0) {
      issues.push(
        issue(workflow, 'ERROR_ROUTE_FORBIDDEN', 'STOP cannot have an outgoing error connection', {
          nodeId: node.id,
        }),
      );
    }
    for (const input of connectionInputsFor(definition).filter((port) => port.required)) {
      const incoming = workflow.edges.filter(
        (edge) => edge.targetNodeId === node.id && (edge.targetPort ?? 'in') === input.name,
      );
      if (incoming.length === 0) {
        issues.push(
          issue(workflow, 'INPUT_REQUIRED', input.label + ' requires a connection', {
            nodeId: node.id,
          }),
        );
      }
    }
  }

  for (const nodeId of cycleNodeIds(workflow)) {
    issues.push(
      issue(workflow, 'GRAPH_CYCLE', 'Control flow contains an unsupported cycle', { nodeId }),
    );
  }

  return issues.sort((left, right) => left.id.localeCompare(right.id));
}

export function requiredPermissionsForWorkflow(
  workflow: WorkflowDocument,
  catalog: readonly NodeDefinition[],
) {
  return [
    ...new Set(
      workflow.nodes.flatMap(
        (node) =>
          catalog.find((definition) => definition.type === node.type)?.requiredPermissions ?? [],
      ),
    ),
  ].sort();
}
