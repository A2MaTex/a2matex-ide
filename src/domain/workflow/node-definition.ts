import type { JsonValue } from '@shared/types/json-value';

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

export interface NodeDefinition {
  type: string;
  version: number;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  /** Control-flow handles. These are not the node's input/output data variables. */
  connectionInputs?: PortDefinition[];
  connectionOutputs?: PortDefinition[];
  /** @deprecated Legacy aliases kept for older in-memory catalogs and tests. */
  inputs?: PortDefinition[];
  /** @deprecated Legacy aliases kept for older in-memory catalogs and tests. */
  outputs?: PortDefinition[];
  inputVariables?: PropertySchema;
  outputVariables?: PropertySchema;
  properties: PropertySchema;
  requiredCapabilities: string[];
  requiredPermissions: string[];
  runtimeHandler: string;
  supportedErrorPolicies: Array<'ERROR_BRANCH' | 'STOP'>;
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
