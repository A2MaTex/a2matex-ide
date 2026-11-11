import type { WorkflowBinding, WorkflowNode } from '@domain/project/project';
import {
  emptyObjectValueSchema,
  fieldValueIsValid,
  validateObjectValue,
  type ObjectValueIssue,
  type ObjectValueSchema,
} from '@domain/schema/object-value-schema';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { isLiteralBinding, literalBinding } from '@domain/workflow/workflow-binding';
import type { JsonValue } from '@shared/types/json-value';

export interface NodeConfigurationDraft {
  nodeId: string;
  baseRevision: number;
  config: Record<string, JsonValue>;
  inputSchema: ObjectValueSchema;
  bindings: Record<string, WorkflowBinding>;
  errorPolicy: WorkflowNode['errorPolicy'];
  modeBindings: Record<string, Record<string, WorkflowBinding>>;
}

export interface NodeConfigurationIssue extends ObjectValueIssue {
  storage: 'binding' | 'config';
}

function withDefaults(
  schema: ObjectValueSchema,
  values: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = structuredClone(values);
  for (const [field, property] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(result, field) && property.default !== undefined) {
      result[field] = structuredClone(property.default);
    }
  }
  return result;
}

function withBindingDefaults(
  schema: ObjectValueSchema,
  bindings: Readonly<Record<string, WorkflowBinding>>,
) {
  const result: Record<string, WorkflowBinding> = structuredClone(bindings);
  for (const [field, property] of Object.entries(schema.properties)) {
    if (!result[field] && property.default !== undefined) {
      result[field] = literalBinding(property.default);
    }
  }
  return result;
}

export function createNodeConfigurationDraft(
  node: WorkflowNode,
  baseRevision: number,
  definition?: NodeDefinition,
): NodeConfigurationDraft {
  const config = definition?.configSchema
    ? Object.fromEntries(
        Object.entries(node.config).filter(([field]) =>
          Object.hasOwn(definition.configSchema!.properties, field),
        ),
      )
    : structuredClone(node.config);
  return {
    nodeId: node.id,
    baseRevision,
    config,
    inputSchema: structuredClone(node.inputSchema ?? emptyObjectValueSchema()),
    bindings: structuredClone(node.bindings),
    errorPolicy: node.errorPolicy,
    modeBindings:
      typeof config.targetMode === 'string'
        ? { [config.targetMode]: structuredClone(node.bindings) }
        : {},
  };
}

export function setDraftConfigValue(
  draft: NodeConfigurationDraft,
  field: string,
  value: JsonValue | undefined,
): NodeConfigurationDraft {
  if (value === undefined) {
    const config = { ...draft.config };
    delete config[field];
    return { ...draft, config };
  }
  return { ...draft, config: { ...draft.config, [field]: structuredClone(value) } };
}

export function setDraftBindingValue(
  draft: NodeConfigurationDraft,
  field: string,
  value: JsonValue | undefined,
): NodeConfigurationDraft {
  if (value === undefined) {
    const bindings = { ...draft.bindings };
    delete bindings[field];
    return { ...draft, bindings };
  }
  return { ...draft, bindings: { ...draft.bindings, [field]: literalBinding(value) } };
}

export function setDraftErrorPolicy(
  draft: NodeConfigurationDraft,
  errorPolicy: WorkflowNode['errorPolicy'],
): NodeConfigurationDraft {
  return { ...draft, errorPolicy };
}

export function selectDraftTargetMode(
  draft: NodeConfigurationDraft,
  definition: NodeDefinition,
  mode: string,
): NodeConfigurationDraft {
  const targetMode = definition.configSchema?.properties.targetMode;
  const allowed = targetMode?.type === 'string' ? targetMode.enum : undefined;
  const selected = definition.targeting?.modes.find((entry) => entry.mode === mode);
  if (!allowed?.includes(mode) || !selected) return draft;

  const inputSchema = structuredClone(selected.bindingSchema);
  const currentMode = draft.config.targetMode;
  const modeBindings = structuredClone(draft.modeBindings);
  if (typeof currentMode === 'string') {
    modeBindings[currentMode] = structuredClone(draft.bindings);
  }
  const sourceBindings = modeBindings[mode] ?? draft.bindings;
  const bindings = Object.fromEntries(
    Object.entries(sourceBindings).filter(([field, binding]) => {
      const property = inputSchema.properties[field];
      return (
        Boolean(property) &&
        (!isLiteralBinding(binding) || fieldValueIsValid(property!, binding.value))
      );
    }),
  );
  const nextBindings = withBindingDefaults(inputSchema, bindings);
  modeBindings[mode] = structuredClone(nextBindings);

  return {
    ...draft,
    config: { ...draft.config, targetMode: mode },
    inputSchema,
    bindings: nextBindings,
    modeBindings,
  };
}

export function validateNodeConfigurationDraft(
  draft: NodeConfigurationDraft,
  definition: NodeDefinition,
): NodeConfigurationIssue[] {
  const issues: NodeConfigurationIssue[] = [];
  if (definition.configSchema) {
    issues.push(
      ...validateObjectValue(
        definition.configSchema,
        withDefaults(definition.configSchema, draft.config),
      ).map((entry) => ({ ...entry, storage: 'config' as const })),
    );
  }

  for (const field of draft.inputSchema.required) {
    if (!draft.bindings[field] && draft.inputSchema.properties[field]?.default === undefined) {
      issues.push({
        field,
        storage: 'binding',
        code: 'required',
        message: `${field} is required`,
      });
    }
  }
  for (const [field, binding] of Object.entries(draft.bindings)) {
    const property = draft.inputSchema.properties[field];
    if (!property) {
      issues.push({
        field,
        storage: 'binding',
        code: 'unknown',
        message: `${field} is not supported`,
      });
    } else if (isLiteralBinding(binding) && !fieldValueIsValid(property, binding.value)) {
      issues.push({
        field,
        storage: 'binding',
        code: 'invalid',
        message: `${field} has an invalid value`,
      });
    }
  }
  return issues;
}

export function configurationCommitPayload(
  draft: NodeConfigurationDraft,
  definition: NodeDefinition,
) {
  return {
    nodeId: draft.nodeId,
    baseRevision: draft.baseRevision,
    config: definition.configSchema
      ? withDefaults(definition.configSchema, draft.config)
      : structuredClone(draft.config),
    inputSchema: structuredClone(draft.inputSchema),
    bindings: withBindingDefaults(draft.inputSchema, draft.bindings),
    errorPolicy: draft.errorPolicy,
  };
}
