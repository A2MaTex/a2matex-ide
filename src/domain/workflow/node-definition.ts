import type { JsonValue } from '@shared/types/json-value';
import {
  emptyObjectValueSchema,
  type FieldValueSchema,
  type ObjectValueSchema,
} from '@domain/schema/object-value-schema';

export type WorkflowBindingKind =
  'LITERAL' | 'WORKFLOW_INPUT' | 'NODE_OUTPUT' | 'FLOW_VARIABLE' | 'GLOBAL_VARIABLE';

export interface BindingKindDefinition {
  fields: string[];
  literalTypes?: Array<'string' | 'number' | 'boolean'>;
}

export interface BindingInputDefinition {
  name: string;
  required: boolean;
  valueSchema?: FieldValueSchema;
  bindingKinds: Partial<Record<WorkflowBindingKind, BindingKindDefinition>>;
}

export interface SwitchOperatorDefinition {
  value: string;
  supportedTypes: Array<'string' | 'number' | 'boolean'>;
  operandCount: 0 | 1;
}

export interface SwitchNodeDefinition {
  minimumRules: number;
  maximumRules: number;
  operators: SwitchOperatorDefinition[];
  operand: BindingInputDefinition;
}

export type ValueType =
  | 'flow'
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'image'
  | 'device'
  | { list: ValueType }
  | { optional: ValueType };

export interface PortDefinition {
  name: string;
  label: string;
  direction: 'input' | 'output';
  kind: 'control' | 'data';
  valueType: ValueType;
  cardinality: 'one' | 'many';
  required?: boolean;
}

export interface PropertyDefinition {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title: string;
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  secret?: boolean;
  expression?: boolean;
  format?: string;
  jsonSchema?: Record<string, JsonValue>;
  storage: 'binding' | 'config';
  ui?: {
    control?: 'input' | 'textarea' | 'select' | 'switch' | 'code' | 'asset' | 'android-selector';
    group?: string;
    order?: number;
    placeholder?: string;
  };
}

export interface PropertySchema {
  type: 'object';
  required?: string[];
  properties: Record<string, PropertyDefinition>;
}

export interface RequiredCapability {
  code: string;
  name: string;
  description: string;
  isSensitive: boolean;
}

export interface NodeDefinition {
  type: string;
  version: number;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  connectionInputs?: PortDefinition[];
  connectionOutputs?: PortDefinition[];
  /** @deprecated Legacy aliases kept for older in-memory catalogs and tests. */
  inputs?: PortDefinition[];
  /** @deprecated Legacy aliases kept for older in-memory catalogs and tests. */
  outputs?: PortDefinition[];
  inputVariables?: PropertySchema;
  outputVariables?: PropertySchema;
  instanceInputSchema?: ObjectValueSchema;
  bindingInputs?: Record<string, BindingInputDefinition>;
  outputSchema?: ObjectValueSchema;
  configSchema?: ObjectValueSchema;
  targeting?: {
    modes: Array<{ mode: string; bindingSchema: ObjectValueSchema }>;
  };
  outputPortKeys?: string[];
  dynamicOutputPortKeysFromRules?: boolean;
  switch?: SwitchNodeDefinition;
  properties: PropertySchema;
  requiredCapabilities: RequiredCapability[];
  requiredPermissions: string[];
  runtimeHandler: string;
  defaultTimeoutMs?: number;
  minimumRuntimeVersion?: string;
  deprecation?: {
    message: string;
    replacement?: { type: string; version: number };
  };
}

export function connectionInputsFor(definition: NodeDefinition): readonly PortDefinition[] {
  return definition.connectionInputs ?? definition.inputs ?? [];
}

export function connectionOutputsFor(definition: NodeDefinition): readonly PortDefinition[] {
  return definition.connectionOutputs ?? definition.outputs ?? [];
}

export function logicalOutputPortsFor(definition: NodeDefinition): readonly string[] {
  return definition.outputPortKeys ?? connectionOutputsFor(definition).map(({ name }) => name);
}

export function logicalOutputPortsForNode(
  definition: NodeDefinition,
  node: { config: Readonly<Record<string, JsonValue>>; errorPolicy: 'ERROR_BRANCH' | 'STOP' },
): readonly string[] {
  const dynamic = definition.dynamicOutputPortKeysFromRules
    ? switchRules(node.config).map(({ id }) => id)
    : [];
  const staticPorts = logicalOutputPortsFor(definition).filter(
    (port) => port !== 'error' || node.errorPolicy === 'ERROR_BRANCH',
  );
  return [...dynamic, ...staticPorts];
}

export function defaultLogicalOutputPortFor(definition: NodeDefinition): string | undefined {
  const ports = logicalOutputPortsFor(definition);
  return ports.includes('success') ? 'success' : ports[0];
}

export function inputSchemaFor(
  definition: NodeDefinition,
  config: Readonly<Record<string, JsonValue>>,
): ObjectValueSchema | undefined {
  if (!definition.targeting) {
    return definition.instanceInputSchema ?? emptyObjectValueSchema();
  }
  const targetMode = config.targetMode;
  if (typeof targetMode !== 'string') return undefined;
  return definition.targeting.modes.find(({ mode }) => mode === targetMode)?.bindingSchema;
}

export function bindingInputsFor(
  definition: NodeDefinition,
  config: Readonly<Record<string, JsonValue>>,
): Record<string, BindingInputDefinition> {
  if (!definition.targeting) return definition.bindingInputs ?? {};
  const schema = inputSchemaFor(definition, config);
  if (!schema) return {};
  return Object.fromEntries(
    Object.entries(schema.properties).map(([name, valueSchema]) => [
      name,
      {
        name,
        required: schema.required.includes(name),
        valueSchema,
        bindingKinds: { LITERAL: { fields: ['value'] } },
      } satisfies BindingInputDefinition,
    ]),
  );
}

export function switchRules(config: Readonly<Record<string, JsonValue>>) {
  const rules = config.rules;
  if (!Array.isArray(rules)) return [];
  return rules.flatMap((rule) => {
    if (!rule || Array.isArray(rule) || typeof rule !== 'object') return [];
    const id = rule.id;
    const operator = rule.operator;
    return typeof id === 'string' && typeof operator === 'string' ? [{ id, operator }] : [];
  });
}
