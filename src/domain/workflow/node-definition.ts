import type { JsonValue } from '../../shared/types/json-value.js';

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
  ui?: {
    control?: 'input' | 'textarea' | 'select' | 'switch' | 'code' | 'asset';
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
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  properties: PropertySchema;
  requiredCapabilities: string[];
  requiredPermissions: string[];
  runtimeHandler: string;
  deprecation?: {
    message: string;
    replacement?: { type: string; version: number };
  };
}
