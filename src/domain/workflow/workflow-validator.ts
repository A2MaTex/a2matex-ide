import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import { findNodeDefinition } from '@domain/workflow/node-catalog';
import type { NodeDefinition, PropertyDefinition } from '@domain/workflow/node-definition';

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
    id: [workflow.id, code, path].join(':'),
    severity: 'error',
    code,
    message,
    workflowId: workflow.id,
    ...target,
  };
}

function propertyValueIsValid(value: unknown, property: PropertyDefinition) {
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
  const issues: WorkflowIssue[] = [];
  for (const required of definition.properties.required ?? []) {
    if (node.params[required] === undefined || node.params[required] === '') {
      issues.push(
        issue(workflow, 'PROPERTY_REQUIRED', required + ' is required', {
          nodeId: node.id,
          propertyPath: 'params.' + required,
        }),
      );
    }
  }
  for (const [name, value] of Object.entries(node.params)) {
    const property = definition.properties.properties[name];
    if (!property) {
      issues.push(
        issue(workflow, 'PROPERTY_UNKNOWN', name + ' is not supported by this node version', {
          nodeId: node.id,
          propertyPath: 'params.' + name,
        }),
      );
      continue;
    }
    if (!propertyValueIsValid(value, property)) {
      issues.push(
        issue(workflow, 'PROPERTY_INVALID', property.title + ' has an invalid value', {
          nodeId: node.id,
          propertyPath: 'params.' + name,
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
  const source = nodes.get(edge.source.nodeId);
  const target = nodes.get(edge.target.nodeId);
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
  const output = sourceDefinition.outputs.find((port) => port.name === edge.source.port);
  const input = targetDefinition.inputs.find((port) => port.name === edge.target.port);
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
    const targets = outgoing.get(edge.source.nodeId) ?? [];
    targets.push(edge.target.nodeId);
    outgoing.set(edge.source.nodeId, targets);
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
    const definition = findNodeDefinition(node.type, node.nodeVersion, catalog);
    if (!definition) {
      issues.push(
        issue(
          workflow,
          'NODE_DEFINITION_MISSING',
          node.type + '@' + node.nodeVersion + ' is unavailable',
          { nodeId: node.id },
        ),
      );
      continue;
    }
    definitions.set(node.id, definition);
    issues.push(...validateNodeProperties(workflow, node, definition));
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

  const starts = workflow.nodes.filter(
    (node) => node.type === 'trigger.start' && node.nodeVersion === 1,
  );
  if (starts.length !== 1) {
    issues.push(
      issue(
        workflow,
        'ENTRY_TRIGGER_COUNT',
        starts.length === 0
          ? 'Entry workflow requires one Start node'
          : 'Entry workflow may only contain one Start node',
      ),
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
      edge.source.nodeId +
      ':' +
      edge.source.port +
      '->' +
      edge.target.nodeId +
      ':' +
      edge.target.port;
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
    for (const input of definition.inputs.filter((port) => port.required)) {
      const incoming = workflow.edges.filter(
        (edge) => edge.target.nodeId === node.id && edge.target.port === input.name,
      );
      if (incoming.length === 0) {
        issues.push(
          issue(workflow, 'INPUT_REQUIRED', input.label + ' requires a connection', {
            nodeId: node.id,
          }),
        );
      }
      if (input.cardinality === 'one' && incoming.length > 1) {
        issues.push(
          issue(workflow, 'INPUT_CARDINALITY', input.label + ' accepts only one connection', {
            nodeId: node.id,
          }),
        );
      }
    }
    for (const output of definition.outputs.filter((port) => port.cardinality === 'one')) {
      const outgoing = workflow.edges.filter(
        (edge) => edge.source.nodeId === node.id && edge.source.port === output.name,
      );
      if (outgoing.length > 1) {
        issues.push(
          issue(workflow, 'OUTPUT_CARDINALITY', output.label + ' accepts only one connection', {
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
          findNodeDefinition(node.type, node.nodeVersion, catalog)?.requiredPermissions ?? [],
      ),
    ),
  ].sort();
}
