import type { WorkflowBinding, WorkflowNode } from '@domain/project/project';
import {
  emptyObjectValueSchema,
  validateObjectValue,
  type ObjectValueIssue,
  type ObjectValueSchema,
} from '@domain/schema/object-value-schema';
import {
  bindingInputsFor,
  inputSchemaFor,
  switchRules,
  type BindingInputDefinition,
  type NodeDefinition,
} from '@domain/workflow/node-definition';
import {
  defaultBindingFor,
  firstBindingKind,
  isLiteralBinding,
  literalBinding,
  validateWorkflowBinding,
} from '@domain/workflow/workflow-binding';
import type { JsonValue } from '@shared/types/json-value';

export interface NodeConfigurationDraft {
  nodeId: string;
  baseRevision: number;
  config: Record<string, JsonValue>;
  inputSchema: ObjectValueSchema;
  bindingInputs: Record<string, BindingInputDefinition>;
  bindings: Record<string, WorkflowBinding>;
  errorPolicy: WorkflowNode['errorPolicy'];
  timeoutMs?: number;
  retryPolicy?: WorkflowNode['retryPolicy'];
}

export interface NodeConfigurationIssue extends ObjectValueIssue {
  storage: 'binding' | 'config' | 'execution';
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
  inputs: Readonly<Record<string, BindingInputDefinition>>,
  bindings: Readonly<Record<string, WorkflowBinding>>,
) {
  const result: Record<string, WorkflowBinding> = structuredClone(bindings);
  for (const [field, input] of Object.entries(inputs)) {
    if (result[field]) continue;
    if (input.valueSchema?.default !== undefined && input.bindingKinds.LITERAL) {
      result[field] = literalBinding(input.valueSchema.default);
      continue;
    }
    const kind = input.required ? firstBindingKind(input) : undefined;
    if (kind) result[field] = defaultBindingFor(input, kind);
  }
  return result;
}

export function createNodeConfigurationDraft(
  node: WorkflowNode,
  baseRevision: number,
  definition?: NodeDefinition,
): NodeConfigurationDraft {
  const config = structuredClone(node.config);
  const inputSchema = definition
    ? (inputSchemaFor(definition, config) ?? emptyObjectValueSchema())
    : emptyObjectValueSchema();
  const bindings = Object.fromEntries(
    Object.entries(node.bindings).map(([field, binding]) => [
      field,
      binding.kind === 'constant' && isLiteralBinding(binding)
        ? literalBinding(binding.value)
        : structuredClone(binding),
    ]),
  );
  const bindingInputs = definition ? bindingInputsFor(definition, config) : {};
  return {
    nodeId: node.id,
    baseRevision,
    config,
    inputSchema: structuredClone(inputSchema),
    bindingInputs,
    bindings: withBindingDefaults(bindingInputs, bindings),
    errorPolicy: node.errorPolicy,
    ...(node.timeoutMs === undefined ? {} : { timeoutMs: node.timeoutMs }),
    ...(node.retryPolicy ? { retryPolicy: structuredClone(node.retryPolicy) } : {}),
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
  return setDraftBinding(draft, field, value === undefined ? undefined : literalBinding(value));
}

export function setDraftBinding(
  draft: NodeConfigurationDraft,
  field: string,
  binding: WorkflowBinding | undefined,
): NodeConfigurationDraft {
  if (binding === undefined) {
    const bindings = { ...draft.bindings };
    delete bindings[field];
    return { ...draft, bindings };
  }
  return {
    ...draft,
    bindings: { ...draft.bindings, [field]: structuredClone(binding) },
  };
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

  const ownedFields = new Set(
    definition.targeting?.modes.flatMap((entry) => Object.keys(entry.bindingSchema.properties)),
  );
  const bindings = Object.fromEntries(
    Object.entries(draft.bindings).filter(([field]) => !ownedFields.has(field)),
  );
  const config = { ...draft.config, targetMode: mode };
  const inputSchema = structuredClone(selected.bindingSchema);
  const bindingInputs = bindingInputsFor(definition, config);

  return {
    ...draft,
    config,
    inputSchema,
    bindingInputs,
    bindings: withBindingDefaults(bindingInputs, bindings),
  };
}

export function validateNodeConfigurationDraft(
  draft: NodeConfigurationDraft,
  definition: NodeDefinition,
): NodeConfigurationIssue[] {
  const issues: NodeConfigurationIssue[] = [];
  if (definition.configSchema) {
    const supported = new Set(Object.keys(definition.configSchema.properties));
    const config = Object.fromEntries(
      Object.entries(draft.config).filter(([field]) => supported.has(field)),
    );
    issues.push(
      ...validateObjectValue(
        definition.configSchema,
        withDefaults(definition.configSchema, config),
      ).map((entry) => ({ ...entry, storage: 'config' as const })),
    );
    for (const field of Object.keys(draft.config)) {
      if (!supported.has(field) && !(definition.switch && field === 'rules')) {
        issues.push({
          field,
          storage: 'config',
          code: 'unknown',
          message: `${field} is not supported`,
        });
      }
    }
  }

  const inputs: Record<string, BindingInputDefinition> = { ...draft.bindingInputs };
  if (definition.switch) {
    const leftValue = draft.bindings.value?.value;
    const leftType =
      typeof leftValue === 'string'
        ? 'string'
        : typeof leftValue === 'number'
          ? 'number'
          : typeof leftValue === 'boolean'
            ? 'boolean'
            : undefined;
    const rules = switchRules(draft.config);
    const rawRules = draft.config.rules;
    if (
      !Array.isArray(rawRules) ||
      rules.length !== rawRules.length ||
      rules.length < definition.switch.minimumRules ||
      rules.length > definition.switch.maximumRules ||
      new Set(rules.map(({ id }) => id)).size !== rules.length
    ) {
      issues.push({
        field: 'rules',
        storage: 'config',
        code: 'invalid',
        message: 'Switch rules are invalid',
      });
    }
    for (const rule of rules) {
      const operator = definition.switch.operators.find(({ value }) => value === rule.operator);
      if (!operator) {
        issues.push({
          field: 'rules',
          storage: 'config',
          code: 'invalid',
          message: `Rule ${rule.id} uses an unsupported operator`,
        });
      } else if (operator.operandCount === 1) {
        inputs[rule.id] = { ...definition.switch.operand, name: rule.id };
      } else if (draft.bindings[rule.id]) {
        issues.push({
          field: rule.id,
          storage: 'binding',
          code: 'invalid',
          message: `Rule ${rule.id} must not have an operand`,
        });
      }
      if (operator && leftType && !operator.supportedTypes.includes(leftType)) {
        issues.push({
          field: 'rules',
          storage: 'config',
          code: 'invalid',
          message: `Operator ${operator.value} does not support ${leftType} values`,
        });
      }
      const operandValue = draft.bindings[rule.id]?.value;
      if (
        operator?.operandCount === 1 &&
        leftType &&
        operandValue !== undefined &&
        typeof operandValue !== leftType
      ) {
        issues.push({
          field: rule.id,
          storage: 'binding',
          code: 'invalid',
          message: `Rule ${rule.id} operand type must match the Switch value`,
        });
      }
    }
  }

  for (const [field, input] of Object.entries(inputs)) {
    for (const message of validateWorkflowBinding(draft.bindings[field], input)) {
      issues.push({
        field,
        storage: 'binding',
        code: 'invalid',
        message,
      });
    }
  }
  for (const field of Object.keys(draft.bindings)) {
    if (!Object.hasOwn(inputs, field)) {
      issues.push({
        field,
        storage: 'binding',
        code: 'unknown',
        message: `${field} is not supported`,
      });
    }
  }

  if (
    draft.timeoutMs !== undefined &&
    (!Number.isInteger(draft.timeoutMs) || draft.timeoutMs < 1 || draft.timeoutMs > 600_000)
  ) {
    issues.push({
      field: 'timeoutMs',
      storage: 'execution',
      code: 'invalid',
      message: 'Timeout must be between 1 and 600000 ms',
    });
  }
  if (
    draft.retryPolicy?.maxAttempts !== undefined &&
    (!Number.isInteger(draft.retryPolicy.maxAttempts) ||
      draft.retryPolicy.maxAttempts < 1 ||
      draft.retryPolicy.maxAttempts > 3)
  ) {
    issues.push({
      field: 'maxAttempts',
      storage: 'execution',
      code: 'invalid',
      message: 'Retry attempts must be between 1 and 10',
    });
  }
  if (
    draft.retryPolicy?.delayMs !== undefined &&
    (!Number.isInteger(draft.retryPolicy.delayMs) ||
      draft.retryPolicy.delayMs < 0 ||
      draft.retryPolicy.delayMs > 60_000)
  ) {
    issues.push({
      field: 'delayMs',
      storage: 'execution',
      code: 'invalid',
      message: 'Retry delay must be between 0 and 300000 ms',
    });
  }
  return issues;
}

export function configurationCommitPayload(
  draft: NodeConfigurationDraft,
  definition: NodeDefinition,
) {
  const retryPolicy = draft.retryPolicy
    ? Object.fromEntries(
        Object.entries(draft.retryPolicy).filter(([, value]) => value !== undefined),
      )
    : undefined;
  return {
    nodeId: draft.nodeId,
    baseRevision: draft.baseRevision,
    config: definition.configSchema
      ? {
          ...withDefaults(definition.configSchema, draft.config),
          ...(definition.switch ? { rules: structuredClone(draft.config.rules ?? []) } : {}),
        }
      : structuredClone(draft.config),
    bindings: withBindingDefaults(draft.bindingInputs, draft.bindings),
    errorPolicy: draft.errorPolicy,
    ...(draft.timeoutMs === undefined ? {} : { timeoutMs: draft.timeoutMs }),
    ...(retryPolicy && Object.keys(retryPolicy).length > 0
      ? { retryPolicy: structuredClone(retryPolicy) }
      : {}),
  };
}
