import type { WorkflowBinding } from '@domain/project/project';
import { fieldValueIsValid } from '@domain/schema/object-value-schema';
import type { BindingInputDefinition, WorkflowBindingKind } from '@domain/workflow/node-definition';
import type { JsonValue } from '@shared/types/json-value';

const bindingKinds: readonly WorkflowBindingKind[] = [
  'LITERAL',
  'WORKFLOW_INPUT',
  'NODE_OUTPUT',
  'FLOW_VARIABLE',
  'GLOBAL_VARIABLE',
];

const variableNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;

export function isLiteralBinding(
  binding: WorkflowBinding | undefined,
): binding is WorkflowBinding & { value: JsonValue } {
  return (
    (binding?.kind === 'LITERAL' || binding?.kind === 'constant') && Object.hasOwn(binding, 'value')
  );
}

export function literalBinding(value: JsonValue): WorkflowBinding {
  return { kind: 'LITERAL', value: structuredClone(value) };
}

export function workflowBindingKind(
  binding: WorkflowBinding | undefined,
): WorkflowBindingKind | undefined {
  return bindingKinds.find((kind) => kind === binding?.kind);
}

/** Selects a stable authoring default instead of relying on JSON object key order from Catalog. */
export function preferredBindingKind(
  input: BindingInputDefinition,
): WorkflowBindingKind | undefined {
  return bindingKinds.find((kind) => Boolean(input.bindingKinds[kind]));
}

function scalarType(value: JsonValue): 'boolean' | 'number' | 'string' | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : undefined;
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return undefined;
}

export function validateWorkflowBinding(
  binding: WorkflowBinding | undefined,
  input: BindingInputDefinition,
): string[] {
  if (!binding) return input.required ? [`${input.name} is required`] : [];
  const kind = workflowBindingKind(binding);
  if (!kind || !input.bindingKinds[kind]) {
    return [`${input.name} uses an unsupported binding source`];
  }
  if (kind === 'LITERAL' && !Object.hasOwn(binding, 'value')) {
    return [`${input.name} is required`];
  }

  const contract = input.bindingKinds[kind]!;
  const expected = new Set(['kind', ...contract.fields]);
  if (Object.keys(binding).some((field) => !expected.has(field))) {
    return [`${input.name} contains fields from another binding source`];
  }
  if (contract.fields.some((field) => !Object.hasOwn(binding, field))) {
    return [`${input.name} is missing fields required by ${kind}`];
  }

  if (kind === 'LITERAL') {
    const value = binding.value;
    if (input.valueSchema && !fieldValueIsValid(input.valueSchema, value)) {
      return [`${input.name} has an invalid literal value`];
    }
    if (contract.literalTypes && !contract.literalTypes.includes(scalarType(value)!)) {
      return [`${input.name} has an unsupported literal type`];
    }
  } else if (kind === 'WORKFLOW_INPUT') {
    if (typeof binding.inputName !== 'string' || binding.inputName.length === 0) {
      return [`${input.name} must select a workflow input`];
    }
  } else if (kind === 'NODE_OUTPUT') {
    if (
      typeof binding.nodeId !== 'string' ||
      binding.nodeId.length === 0 ||
      typeof binding.field !== 'string' ||
      binding.field.length === 0
    ) {
      return [`${input.name} must select a producer node and output field`];
    }
  } else if (typeof binding.name !== 'string' || !variableNamePattern.test(binding.name)) {
    return [`${input.name} variable name is invalid`];
  }
  return [];
}

export function defaultBindingFor(
  input: BindingInputDefinition,
  kind: WorkflowBindingKind,
): WorkflowBinding {
  if (kind === 'LITERAL') {
    const allowed = input.bindingKinds.LITERAL?.literalTypes;
    if (input.valueSchema?.default !== undefined) {
      return literalBinding(input.valueSchema.default);
    }
    if (
      input.valueSchema?.type === 'integer' ||
      input.valueSchema?.type === 'number' ||
      allowed?.[0] === 'number'
    ) {
      return { kind };
    }
    const value = input.valueSchema?.type === 'boolean' || allowed?.[0] === 'boolean' ? false : '';
    return literalBinding(value);
  }
  if (kind === 'WORKFLOW_INPUT') return { kind, inputName: '' };
  if (kind === 'NODE_OUTPUT') return { kind, nodeId: '', field: '' };
  return { kind, name: '' };
}
