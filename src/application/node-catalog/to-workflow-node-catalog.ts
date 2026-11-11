import type { CatalogNodeDefinition } from '@domain/node-catalog/node-catalog';
import { ANDROID_SELECTOR_V1_FORMAT } from '@domain/android-inspector/android-selector';
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

const START_NODE_TYPES = new Set(['flow.start', 'trigger.start']);

const NODE_ICONS: Record<string, string> = {
  'flow.start': 'play',
  'flow.end': 'square',
  'flow.delay': 'timer',
  'flow.switch': 'git-branch',
  'flow.set_variable': 'variable',
  'flow.wait_for_variable': 'hourglass',
  'android.tap': 'mouse-pointer-click',
  'android.input_text': 'keyboard',
  'android.launch_app': 'smartphone',
  'android.long_press': 'hand',
  'android.press_back': 'arrow-left',
  'android.press_home': 'house',
  'android.screenshot': 'camera',
  'android.swipe': 'move',
  'utility.log': 'message-square-text',
};

const flowInput: PortDefinition = {
  name: 'in',
  label: 'In',
  direction: 'input',
  kind: 'control',
  valueType: 'flow',
  cardinality: 'many',
};

function titleFromName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

const flowOutput: PortDefinition = {
  name: 'out',
  label: 'Out',
  direction: 'output',
  kind: 'control',
  valueType: 'flow',
  cardinality: 'many',
};

function toProperty(
  name: string,
  schema: Record<string, JsonValue>,
  order: number,
  storage: PropertyDefinition['storage'],
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
    jsonSchema: structuredClone(schema),
    storage,
    ui: {
      order,
      control:
        schema.format === ANDROID_SELECTOR_V1_FORMAT
          ? 'android-selector'
          : Array.isArray(schema.enum)
            ? 'select'
            : type === 'boolean'
              ? 'switch'
              : 'input',
    },
  };

  if (typeof schema.description === 'string') property.description = schema.description;
  if (schema.default !== undefined) property.default = schema.default;
  if (Array.isArray(schema.enum)) property.enum = schema.enum;
  if (typeof schema.minimum === 'number') property.minimum = schema.minimum;
  if (typeof schema.maximum === 'number') property.maximum = schema.maximum;
  if (typeof schema.pattern === 'string') property.pattern = schema.pattern;
  if (typeof schema.format === 'string') property.format = schema.format;

  return property;
}

function toProperties(node: CatalogNodeDefinition): NodeDefinition['properties'] {
  const schemas: ReadonlyArray<
    readonly [string, Record<string, JsonValue>, PropertyDefinition['storage']]
  > = [
    ...Object.entries(node.configSchema.properties).map(
      ([name, schema]) => [name, schema, 'config'] as const,
    ),
    ...Object.entries(node.inputSchema.properties).map(
      ([name, schema]) => [name, schema, 'binding'] as const,
    ),
  ];
  const properties = Object.fromEntries(
    schemas.flatMap(([name, schema, storage], index) => {
      const property = toProperty(name, schema, index, storage);
      return property ? [[name, property]] : [];
    }),
  );

  return {
    type: 'object',
    required: [...new Set([...node.configSchema.required, ...node.inputSchema.required])],
    properties,
  };
}

function toVariableSchema(
  schema: CatalogNodeDefinition['inputSchema'] | CatalogNodeDefinition['outputSchema'],
): NodeDefinition['inputVariables'] {
  const properties = Object.fromEntries(
    Object.entries(schema.properties).flatMap(([name, definition], index) => {
      const property = toProperty(name, definition, index, 'binding');
      return property ? [[name, property]] : [];
    }),
  );
  return { type: 'object', required: schema.required, properties };
}

export function toWorkflowNodeCatalog(nodes: readonly CatalogNodeDefinition[]): NodeDefinition[] {
  return nodes.map((node) => ({
    type: node.type,
    version: 1,
    displayName: node.displayName,
    description: node.description,
    category: CATEGORY_LABELS[node.category],
    icon: NODE_ICONS[node.type] ?? 'workflow',
    connectionInputs: START_NODE_TYPES.has(node.type) ? [] : [flowInput],
    connectionOutputs: node.outputPorts.length > 0 ? [flowOutput] : [],
    inputVariables: toVariableSchema(node.inputSchema),
    outputVariables: toVariableSchema(node.outputSchema),
    instanceInputSchema: structuredClone(node.inputSchema),
    configSchema: structuredClone(node.configSchema),
    ...(node.targeting ? { targeting: structuredClone(node.targeting) } : {}),
    outputPortKeys: [...node.outputPorts],
    properties: toProperties(node),
    requiredCapabilities: node.capabilities.map((capability) => ({ ...capability })),
    requiredPermissions: [],
    runtimeHandler: node.runtimeHandler,
    supportedErrorPolicies: node.outputPorts.includes('error')
      ? ['STOP', 'ERROR_BRANCH']
      : ['STOP'],
  }));
}
