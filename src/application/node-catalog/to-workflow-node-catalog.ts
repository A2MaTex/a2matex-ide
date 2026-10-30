import type { CatalogNodeDefinition, CatalogObjectSchema } from '@domain/node-catalog/node-catalog';
import type {
  NodeDefinition,
  PortDefinition,
  PropertyDefinition,
} from '@domain/workflow/node-definition';
import type { JsonValue } from '@shared/types/json-value';

const CATEGORY_LABELS: Record<CatalogNodeDefinition['category'], string> = {
  FLOW: 'Flow',
  UTILITY: 'Utility',
  ANDROID: 'Android',
};

const flowInput: PortDefinition = {
  name: 'in',
  label: 'In',
  direction: 'input',
  kind: 'control',
  valueType: 'flow',
  cardinality: 'one',
  required: true,
};

function titleFromName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function toProperty(
  name: string,
  schema: Record<string, JsonValue>,
  order: number,
): PropertyDefinition | null {
  const type = schema.type;
  if (
    type !== 'string' &&
    type !== 'number' &&
    type !== 'integer' &&
    type !== 'boolean' &&
    type !== 'object' &&
    type !== 'array'
  ) {
    return null;
  }

  const property: PropertyDefinition = {
    type,
    title: typeof schema.title === 'string' ? schema.title : titleFromName(name),
    ui: {
      order,
      control: Array.isArray(schema.enum) ? 'select' : type === 'boolean' ? 'switch' : 'input',
    },
  };

  if (typeof schema.description === 'string') property.description = schema.description;
  if (schema.default !== undefined) property.default = schema.default;
  if (Array.isArray(schema.enum)) property.enum = schema.enum;
  if (typeof schema.minimum === 'number') property.minimum = schema.minimum;
  if (typeof schema.maximum === 'number') property.maximum = schema.maximum;
  if (typeof schema.pattern === 'string') property.pattern = schema.pattern;

  return property;
}

function toProperties(node: CatalogNodeDefinition): NodeDefinition['properties'] {
  const schemas: CatalogObjectSchema['properties'] = {
    ...node.configSchema.properties,
    ...node.inputSchema.properties,
  };
  const fieldOrder = node.editorHints.fieldOrder;
  const properties = Object.fromEntries(
    Object.entries(schemas).flatMap(([name, schema], index) => {
      const configuredOrder = fieldOrder.indexOf(name);
      const property = toProperty(name, schema, configuredOrder >= 0 ? configuredOrder : index);
      return property ? [[name, property]] : [];
    }),
  );

  return {
    type: 'object',
    required: [...new Set([...node.configSchema.required, ...node.inputSchema.required])],
    properties,
  };
}

export function toWorkflowNodeCatalog(nodes: readonly CatalogNodeDefinition[]): NodeDefinition[] {
  return nodes.map((node) => ({
    type: node.type,
    version: 1,
    displayName: node.displayName,
    description: node.description,
    category: CATEGORY_LABELS[node.category],
    icon: node.editorHints.icon,
    inputs: [flowInput],
    outputs: node.outputPorts.map((port) => ({
      name: port.key,
      label: port.label,
      direction: 'output',
      kind: 'control',
      valueType: 'flow',
      cardinality: 'one',
    })),
    properties: toProperties(node),
    requiredCapabilities: node.capabilities.map((capability) => capability.code),
    requiredPermissions: [],
    runtimeHandler: node.runtimeHandler,
  }));
}
