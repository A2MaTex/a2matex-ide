import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@domain/project/project';
import {
  ANDROID_SELECTOR_V1_FORMAT,
  isAndroidSelectorV1,
} from '@domain/android-inspector/android-selector';
import {
  bindingInputsFor,
  connectionInputsFor,
  connectionOutputsFor,
  logicalOutputPortsFor,
  logicalOutputPortsForNode,
  switchRules,
  type NodeDefinition,
  type PropertyDefinition,
} from '@domain/workflow/node-definition';
import { nodeOutputOptions } from '@domain/workflow/binding-options';
import {
  createNodeConfigurationDraft,
  validateNodeConfigurationDraft,
} from '@domain/workflow/node-configuration-draft';
import { isLiteralBinding } from '@domain/workflow/workflow-binding';
import type { JsonValue } from '@shared/types/json-value';

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
    return validateNodeConfigurationDraft(
      createNodeConfigurationDraft(node, 0, definition),
      definition,
    ).map((entry) =>
      issue(
        workflow,
        entry.code === 'required' ? 'PROPERTY_REQUIRED' : 'PROPERTY_INVALID',
        entry.message,
        {
          nodeId: node.id,
          propertyPath: `${entry.storage === 'execution' ? '' : `${entry.storage}.`}${entry.field}`,
        },
      ),
    );
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
    logicalOutputPortsForNode(sourceDefinition, source).includes(edge.sourcePort) && sourcePorts[0]
      ? { ...sourcePorts[0], name: edge.sourcePort }
      : undefined;
  const input = targetPorts.find((port) => port.name === 'in');
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

function workflowInputProperty(schema: JsonValue, name: string) {
  if (!schema || Array.isArray(schema) || typeof schema !== 'object') return undefined;
  const properties = schema.properties;
  if (!properties || Array.isArray(properties) || typeof properties !== 'object') return undefined;
  const value = properties[name];
  if (!value || Array.isArray(value) || typeof value !== 'object') return undefined;
  const required = Array.isArray(schema.required) && schema.required.includes(name);
  return { type: typeof value.type === 'string' ? value.type : undefined, required };
}

function validateBindingReferences(
  workflow: WorkflowDocument,
  node: WorkflowNode,
  definition: NodeDefinition,
  catalog: readonly NodeDefinition[],
  workflowInputSchema: JsonValue,
) {
  const inputs = bindingInputsFor(definition, node.config);
  if (definition.switch) {
    for (const rule of switchRules(node.config)) {
      const operator = definition.switch.operators.find(({ value }) => value === rule.operator);
      if (operator?.operandCount === 1) {
        inputs[rule.id] = { ...definition.switch.operand, name: rule.id };
      }
    }
  }
  const issues: WorkflowIssue[] = [];
  for (const [field, input] of Object.entries(inputs)) {
    const binding = node.bindings[field];
    if (binding?.kind === 'WORKFLOW_INPUT' && typeof binding.inputName === 'string') {
      const property = workflowInputProperty(workflowInputSchema, binding.inputName);
      const compatible =
        property &&
        (!input.required || property.required) &&
        (input.valueSchema
          ? property.type === input.valueSchema.type
          : ['string', 'number', 'integer', 'boolean'].includes(property.type ?? ''));
      if (!compatible) {
        issues.push(
          issue(
            workflow,
            'BINDING_SOURCE_INVALID',
            `${field} references an incompatible workflow input`,
            {
              nodeId: node.id,
              propertyPath: `bindings.${field}`,
            },
          ),
        );
      }
    }
    if (
      binding?.kind === 'NODE_OUTPUT' &&
      typeof binding.nodeId === 'string' &&
      typeof binding.field === 'string' &&
      !nodeOutputOptions(workflow, node.id, input, catalog).some(
        (option) => option.nodeId === binding.nodeId && option.field === binding.field,
      )
    ) {
      issues.push(
        issue(
          workflow,
          'BINDING_SOURCE_INVALID',
          `${field} references an unavailable node output`,
          {
            nodeId: node.id,
            propertyPath: `bindings.${field}`,
          },
        ),
      );
    }
  }
  return issues;
}

export function validateWorkflow(
  workflow: WorkflowDocument,
  catalog: readonly NodeDefinition[],
  manifestPermissions: readonly string[] = [],
  workflowInputSchema: JsonValue = {},
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
    issues.push(...validateNodeProperties(workflow, node, definition));
    issues.push(
      ...validateBindingReferences(workflow, node, definition, catalog, workflowInputSchema),
    );
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
    const key = edge.sourceNodeId + ':' + edge.sourcePort + '->' + edge.targetNodeId + ':in';
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
    if (
      node.errorPolicy === 'ERROR_BRANCH' &&
      !logicalOutputPortsFor(definition).includes('error')
    ) {
      issues.push(
        issue(workflow, 'ERROR_POLICY_UNSUPPORTED', 'This node does not support its error policy', {
          nodeId: node.id,
        }),
      );
    } else if (node.errorPolicy === 'ERROR_BRANCH' && errorEdges.length !== 1) {
      issues.push(
        issue(
          workflow,
          'ERROR_ROUTE_REQUIRED',
          'Error Branch requires exactly one error connection',
          {
            nodeId: node.id,
          },
        ),
      );
    } else if (node.errorPolicy === 'STOP' && errorEdges.length > 0) {
      issues.push(
        issue(workflow, 'ERROR_ROUTE_FORBIDDEN', 'STOP cannot have an outgoing error connection', {
          nodeId: node.id,
        }),
      );
    }
    if (definition.switch) {
      for (const port of [...switchRules(node.config).map(({ id }) => id), 'default']) {
        const outgoing = workflow.edges.filter(
          (edge) => edge.sourceNodeId === node.id && edge.sourcePort === port,
        );
        if (outgoing.length !== 1) {
          issues.push(
            issue(
              workflow,
              'SWITCH_ROUTE_REQUIRED',
              `Switch port ${port} requires exactly one outgoing connection`,
              { nodeId: node.id, propertyPath: `ports.${port}` },
            ),
          );
        }
      }
    }
    for (const input of connectionInputsFor(definition).filter((port) => port.required)) {
      const incoming = workflow.edges.filter(
        (edge) => edge.targetNodeId === node.id && input.name === 'in',
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
