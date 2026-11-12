import type { JsonValue } from '@shared/types/json-value';
import type { ObjectValueSchema } from '@domain/schema/object-value-schema';

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
  configSchema?: ObjectValueSchema;
  targeting?: {
    modes: Array<{ mode: string; bindingSchema: ObjectValueSchema }>;
  };
  outputPortKeys?: string[];
  properties: PropertySchema;
  requiredCapabilities: RequiredCapability[];
  requiredPermissions: string[];
  runtimeHandler: string;
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

export function defaultLogicalOutputPortFor(definition: NodeDefinition): string | undefined {
  const ports = logicalOutputPortsFor(definition);
  return ports.includes('success') ? 'success' : ports[0];
}
