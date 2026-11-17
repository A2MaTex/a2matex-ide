import type { CatalogNodeDefinition } from '@domain/node-catalog/node-catalog';
import { ANDROID_SELECTOR_V1_FORMAT } from '@domain/android-inspector/android-selector';
import {
  fieldValueSchema,
  type FieldValueSchema,
  type ObjectValueSchema,
} from '@domain/schema/object-value-schema';
import type {
  BindingInputDefinition,
  BindingKindDefinition,
  NodeDefinition,
  PortDefinition,
  PropertyDefinition,
  SwitchNodeDefinition,
  SwitchOperatorDefinition,
  WorkflowBindingKind,
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

function primitiveField(input: Record<string, JsonValue>): FieldValueSchema | null {
  const { bindingKinds: _bindingKinds, ...candidate } = input;
  void _bindingKinds;
  const parsed = fieldValueSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function primitiveObjectSchema(schema: CatalogNodeDefinition['configSchema']): ObjectValueSchema {
  const properties = Object.fromEntries(
    Object.entries(schema.properties).flatMap(([name, raw]) => {
      const parsed = primitiveField(raw);
      return parsed ? [[name, parsed]] : [];
    }),
  );
  return {
    type: 'object',
    properties,
    required: schema.required.filter((name) => Object.hasOwn(properties, name)),
    additionalProperties: false,
  };
}

const allBindingKinds: WorkflowBindingKind[] = [
  'LITERAL',
  'WORKFLOW_INPUT',
  'NODE_OUTPUT',
  'FLOW_VARIABLE',
  'GLOBAL_VARIABLE',
];

function bindingKindDefinition(
  kind: WorkflowBindingKind,
  raw: JsonValue | undefined,
): BindingKindDefinition {
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const fields = raw.fields;
    if (Array.isArray(fields)) {
      return { fields: fields.filter((field): field is string => typeof field === 'string') };
    }
    if (fields && !Array.isArray(fields) && typeof fields === 'object') {
      const value = fields.value;
      const types =
        value && !Array.isArray(value) && typeof value === 'object' && Array.isArray(value.types)
          ? value.types.filter(
              (type): type is 'string' | 'number' | 'boolean' =>
                type === 'string' || type === 'number' || type === 'boolean',
            )
          : undefined;
      return {
        fields: Object.keys(fields),
        ...(kind === 'LITERAL' && types && types.length > 0 ? { literalTypes: types } : {}),
      };
    }
  }
  const fields =
    kind === 'LITERAL'
      ? ['value']
      : kind === 'WORKFLOW_INPUT'
        ? ['inputName']
        : kind === 'NODE_OUTPUT'
          ? ['nodeId', 'field']
          : ['name'];
  return { fields };
}

function bindingKinds(raw: JsonValue | undefined, fallback: readonly WorkflowBindingKind[]) {
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    return Object.fromEntries(
      allBindingKinds.flatMap((kind) =>
        Object.hasOwn(raw, kind) ? [[kind, bindingKindDefinition(kind, raw[kind])]] : [],
      ),
    ) as BindingInputDefinition['bindingKinds'];
  }
  return Object.fromEntries(
    fallback.map((kind) => [kind, bindingKindDefinition(kind, undefined)]),
  ) as BindingInputDefinition['bindingKinds'];
}

function toBindingInputs(node: CatalogNodeDefinition) {
  const fallback = node.bindingKinds ?? ['LITERAL'];
  return Object.fromEntries(
    Object.entries(node.inputSchema.properties).map(([name, raw]) => [
      name,
      {
        name,
        required: node.inputSchema.required.includes(name),
        ...(primitiveField(raw) ? { valueSchema: primitiveField(raw)! } : {}),
        bindingKinds: bindingKinds(raw.bindingKinds, fallback),
      } satisfies BindingInputDefinition,
    ]),
  );
}

function switchDefinition(node: CatalogNodeDefinition): SwitchNodeDefinition | undefined {
  if (node.type !== 'flow.switch') return undefined;
  const rules = node.configSchema.properties.rules;
  const items = rules?.items;
  const operator =
    items && !Array.isArray(items) && typeof items === 'object' ? items.properties : undefined;
  const operatorField =
    operator && !Array.isArray(operator) && typeof operator === 'object'
      ? operator.operator
      : undefined;
  const options =
    operatorField && !Array.isArray(operatorField) && typeof operatorField === 'object'
      ? operatorField.options
      : undefined;
  const operators: SwitchOperatorDefinition[] = Array.isArray(options)
    ? options.flatMap((option): SwitchOperatorDefinition[] => {
        if (!option || Array.isArray(option) || typeof option !== 'object') return [];
        const { value, operandCount, supportedTypes } = option as Record<string, unknown>;

        if (typeof value !== 'string' || !Array.isArray(supportedTypes)) return [];
        if (operandCount !== 0 && operandCount !== 1) return [];

        const types = supportedTypes.filter(
          (type): type is 'string' | 'number' | 'boolean' =>
            type === 'string' || type === 'number' || type === 'boolean',
        );
        return [{ value, operandCount, supportedTypes: types }];
      })
    : [];
  const dynamic = node.inputSchema.dynamicInputs?.ruleOperand;
  if (operators.length === 0 || !dynamic || !node.outputPorts.dynamicPorts) return undefined;
  return {
    minimumRules: typeof rules.minimumItems === 'number' ? rules.minimumItems : 1,
    maximumRules: typeof rules.maximumItems === 'number' ? rules.maximumItems : 32,
    operators,
    operand: {
      name: 'ruleOperand',
      required: true,
      bindingKinds: bindingKinds(dynamic.bindingKinds, allBindingKinds),
    },
  };
}

function toProperties(node: CatalogNodeDefinition): NodeDefinition['properties'] {
  const schemas: ReadonlyArray<
    readonly [string, Record<string, JsonValue>, PropertyDefinition['storage']]
  > = [
    ...Object.entries(node.configSchema.properties).flatMap(([name, schema]) => {
      const parsed = primitiveField(schema);
      return parsed
        ? [[name, parsed as unknown as Record<string, JsonValue>, 'config'] as const]
        : [];
    }),
    ...Object.entries(node.inputSchema.properties).flatMap(([name, schema]) => {
      const parsed = primitiveField(schema);
      return parsed
        ? [[name, parsed as unknown as Record<string, JsonValue>, 'binding'] as const]
        : [];
    }),
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
      const parsed = primitiveField(definition);
      const property = parsed
        ? toProperty(name, parsed as unknown as Record<string, JsonValue>, index, 'binding')
        : null;
      return property ? [[name, property]] : [];
    }),
  );
  return { type: 'object', required: schema.required, properties };
}

export function toWorkflowNodeCatalog(nodes: readonly CatalogNodeDefinition[]): NodeDefinition[] {
  return nodes.map((node) => {
    const configSchema = primitiveObjectSchema(node.configSchema);
    const inputSchema = primitiveObjectSchema(node.inputSchema);
    const outputSchema = primitiveObjectSchema(node.outputSchema);
    const switchNode = switchDefinition(node);
    return {
      type: node.type,
      version: 1,
      displayName: node.displayName,
      description: node.description,
      category: CATEGORY_LABELS[node.category],
      icon: NODE_ICONS[node.type] ?? 'workflow',
      connectionInputs: START_NODE_TYPES.has(node.type) ? [] : [flowInput],
      connectionOutputs: node.outputPorts.ports.length > 0 || switchNode ? [flowOutput] : [],
      inputVariables: toVariableSchema(node.inputSchema),
      outputVariables: toVariableSchema(node.outputSchema),
      instanceInputSchema: inputSchema,
      bindingInputs: toBindingInputs(node),
      outputSchema,
      configSchema,
      ...(node.targeting ? { targeting: structuredClone(node.targeting) } : {}),
      outputPortKeys: [...node.outputPorts.ports],
      ...(node.outputPorts.dynamicPorts ? { dynamicOutputPortKeysFromRules: true } : {}),
      ...(switchNode ? { switch: switchNode } : {}),
      properties: toProperties(node),
      requiredCapabilities: node.capabilities.map((capability) => ({ ...capability })),
      requiredPermissions: [],
      runtimeHandler: node.runtimeHandler,
      defaultTimeoutMs: node.defaultTimeoutMs,
      minimumRuntimeVersion: node.minimumRuntimeVersion,
    };
  });
}
