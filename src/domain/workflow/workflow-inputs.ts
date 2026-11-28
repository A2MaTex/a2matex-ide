import type { ProjectDocument } from '@domain/project/project';
import type { BindingInputDefinition } from '@domain/workflow/node-definition';
import type { JsonValue } from '@shared/types/json-value';

type JsonObject = { [key: string]: JsonValue };

/**
 * Workflow inputs as the local Runtime accepts them (see the Runtime's
 * `nodecontract/workflow_inputs.go`): only a type, the required flag and numeric / length bounds.
 * Titles, descriptions, defaults and enums are rejected by the Runtime, so Studio does not write them.
 */
export type WorkflowInputType = 'string' | 'integer' | 'number' | 'boolean';

export interface WorkflowInputField {
  name: string;
  type: WorkflowInputType;
  required: boolean;
  /** minLength for text, minimum for numbers. Unused for booleans. */
  min: number | null;
  /** maxLength for text, maximum for numbers. Unused for booleans. */
  max: number | null;
}

export interface WorkflowInputFieldIssue {
  index: number;
  field: 'name' | 'min' | 'max';
  message: string;
}

export const WORKFLOW_INPUT_TYPES: readonly WorkflowInputType[] = [
  'string',
  'integer',
  'number',
  'boolean',
];
export const WORKFLOW_INPUT_NAME_PATTERN = /^[a-z][a-zA-Z0-9]{0,99}$/;
export const WORKFLOW_INPUT_MAX_FIELDS = 100;
export const WORKFLOW_INPUT_MAX_STRING_LENGTH = 10_000;

const RUNTIME_FIELD_KEYS: Record<WorkflowInputType, readonly string[]> = {
  string: ['type', 'minLength', 'maxLength'],
  integer: ['type', 'minimum', 'maximum'],
  number: ['type', 'minimum', 'maximum'],
  boolean: ['type'],
};

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isInputType(value: JsonValue | undefined): value is WorkflowInputType {
  return typeof value === 'string' && (WORKFLOW_INPUT_TYPES as readonly string[]).includes(value);
}

/** Reads the stored schema leniently; unknown field types are skipped. */
export function workflowInputFieldsFromSchema(schema: JsonValue): WorkflowInputField[] {
  if (!isObject(schema) || !isObject(schema.properties)) return [];
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === 'string')
    : [];
  return Object.entries(schema.properties).flatMap(([name, raw]) => {
    if (!isObject(raw) || !isInputType(raw.type)) return [];
    const text = raw.type === 'string';
    return [
      {
        name,
        type: raw.type,
        required: required.includes(name),
        min: raw.type === 'boolean' ? null : finite(text ? raw.minLength : raw.minimum),
        max: raw.type === 'boolean' ? null : finite(text ? raw.maxLength : raw.maximum),
      },
    ];
  });
}

/**
 * Workflow inputs that can safely feed one catalog binding input.
 *
 * Ordinary typed node inputs require an exact type match. A required ordinary input also needs a
 * required workflow input because an optional value may be absent at execution. Generic scalar
 * inputs (Set Variable and Switch operands) intentionally accept optional workflow inputs: their
 * resolved type and presence are checked by the Runtime when the node executes.
 */
export function compatibleWorkflowInputNames(
  schema: JsonValue,
  input: BindingInputDefinition,
): string[] {
  return workflowInputFieldsFromSchema(schema).flatMap((field) => {
    if (!input.valueSchema) return [field.name];
    if (input.required && !field.required) return [];
    return field.type === input.valueSchema.type ? [field.name] : [];
  });
}

export function workflowInputIsCompatible(
  schema: JsonValue,
  input: BindingInputDefinition,
  name: string,
): boolean {
  return compatibleWorkflowInputNames(schema, input).includes(name);
}

/** Builds a schema that only uses keys the Runtime accepts. */
export function workflowInputSchemaFromFields(fields: readonly WorkflowInputField[]): JsonObject {
  const properties: JsonObject = {};
  for (const field of fields) {
    const property: JsonObject = { type: field.type };
    if (field.type === 'string') {
      if (field.min !== null) property.minLength = field.min;
      if (field.max !== null) property.maxLength = field.max;
    } else if (field.type !== 'boolean') {
      if (field.min !== null) property.minimum = field.min;
      if (field.max !== null) property.maximum = field.max;
    }
    properties[field.name] = property;
  }
  return {
    type: 'object',
    properties,
    required: fields.filter((field) => field.required).map((field) => field.name),
    additionalProperties: false,
  };
}

/** Adds one Runtime-compatible field while retaining the existing declared inputs. */
export function addWorkflowInputField(schema: JsonValue, field: WorkflowInputField): JsonObject {
  const properties = isObject(schema) && isObject(schema.properties) ? schema.properties : {};
  if (Object.hasOwn(properties, field.name) && isObject(schema)) {
    return structuredClone(schema);
  }
  const required =
    isObject(schema) && Array.isArray(schema.required)
      ? schema.required.filter((name): name is string => typeof name === 'string')
      : [];
  const addedSchema = workflowInputSchemaFromFields([field]);
  const addedProperties = addedSchema.properties;
  const added = isObject(addedProperties) ? addedProperties[field.name] : undefined;
  if (!added) throw new Error(`Unable to create workflow input ${field.name}`);
  return {
    type: 'object',
    properties: { ...structuredClone(properties), [field.name]: added },
    required: field.required ? [...new Set([...required, field.name])] : required,
    additionalProperties: false,
  };
}

/** Names of stored fields that carry keys the Runtime would reject (e.g. title, enum, default). */
export function workflowInputRuntimeIncompatibilities(schema: JsonValue): string[] {
  if (!isObject(schema) || !isObject(schema.properties)) return [];
  return Object.entries(schema.properties).flatMap(([name, raw]) => {
    if (!isObject(raw) || !isInputType(raw.type)) return [name];
    const allowed = RUNTIME_FIELD_KEYS[raw.type];
    return Object.keys(raw).some((key) => !allowed.includes(key)) ? [name] : [];
  });
}

function boundIssue(field: WorkflowInputField, value: number | null): string | null {
  if (value === null) return null;
  if (field.type === 'string') {
    if (!Number.isInteger(value) || value < 0) return 'Use a whole number of 0 or more';
    if (value > WORKFLOW_INPUT_MAX_STRING_LENGTH) {
      return `Use at most ${WORKFLOW_INPUT_MAX_STRING_LENGTH.toLocaleString('en-US')}`;
    }
  }
  if (field.type === 'integer' && !Number.isSafeInteger(value)) return 'Use a whole number';
  if (!Number.isFinite(value)) return 'Use a number';
  return null;
}

export function validateWorkflowInputFields(
  fields: readonly WorkflowInputField[],
): WorkflowInputFieldIssue[] {
  const issues: WorkflowInputFieldIssue[] = [];
  const seen = new Map<string, number>();
  fields.forEach((field, index) => {
    if (!field.name) {
      issues.push({ index, field: 'name', message: 'Name is required' });
    } else if (!WORKFLOW_INPUT_NAME_PATTERN.test(field.name)) {
      issues.push({
        index,
        field: 'name',
        message: 'Start with a lowercase letter; use only letters and digits (camelCase)',
      });
    } else if (seen.has(field.name)) {
      issues.push({ index, field: 'name', message: 'Another input already uses this name' });
    }
    seen.set(field.name, index);
    if (field.type === 'boolean') return;
    const minIssue = boundIssue(field, field.min);
    const maxIssue = boundIssue(field, field.max);
    if (minIssue) issues.push({ index, field: 'min', message: minIssue });
    if (maxIssue) issues.push({ index, field: 'max', message: maxIssue });
    if (
      !minIssue &&
      !maxIssue &&
      field.min !== null &&
      field.max !== null &&
      field.min > field.max
    ) {
      issues.push({ index, field: 'max', message: 'Must not be lower than the minimum' });
    }
  });
  if (fields.length > WORKFLOW_INPUT_MAX_FIELDS) {
    issues.push({
      index: WORKFLOW_INPUT_MAX_FIELDS,
      field: 'name',
      message: `A workflow can have at most ${WORKFLOW_INPUT_MAX_FIELDS} inputs`,
    });
  }
  return issues;
}

/** How many node fields in the project read each workflow input, keyed by input name. */
export function workflowInputUsage(document: ProjectDocument): Map<string, number> {
  const usage = new Map<string, number>();
  for (const workflow of Object.values(document.workflows)) {
    for (const node of workflow.nodes) {
      for (const binding of Object.values(node.bindings)) {
        if (binding.kind === 'WORKFLOW_INPUT' && typeof binding.inputName === 'string') {
          usage.set(binding.inputName, (usage.get(binding.inputName) ?? 0) + 1);
        }
      }
    }
  }
  return usage;
}

/** Points every WORKFLOW_INPUT binding that reads `from` at `to` instead. */
export function renameWorkflowInputBindings(
  document: ProjectDocument,
  renames: ReadonlyMap<string, string>,
): ProjectDocument {
  if (renames.size === 0) return document;
  let changed = false;
  const workflows = Object.fromEntries(
    Object.entries(document.workflows).map(([path, workflow]) => [
      path,
      {
        ...workflow,
        nodes: workflow.nodes.map((node) => {
          const entries = Object.entries(node.bindings);
          if (
            !entries.some(
              ([, binding]) =>
                binding.kind === 'WORKFLOW_INPUT' &&
                typeof binding.inputName === 'string' &&
                renames.has(binding.inputName),
            )
          ) {
            return node;
          }
          changed = true;
          return {
            ...node,
            bindings: Object.fromEntries(
              entries.map(([field, binding]) =>
                binding.kind === 'WORKFLOW_INPUT' &&
                typeof binding.inputName === 'string' &&
                renames.has(binding.inputName)
                  ? [field, { ...binding, inputName: renames.get(binding.inputName)! }]
                  : [field, binding],
              ),
            ),
          };
        }),
      },
    ]),
  );
  return changed ? { ...document, workflows } : document;
}
