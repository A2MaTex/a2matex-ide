import { describe, expect, it } from 'vitest';

import { toWorkflowNodeCatalog } from '@application/node-catalog/to-workflow-node-catalog';
import { ANDROID_SELECTOR_V1_FORMAT } from '@domain/android-inspector/android-selector';
import {
  catalogNodeDefinitionSchema,
  type CatalogNodeDefinition,
} from '@domain/node-catalog/node-catalog';

const node: CatalogNodeDefinition = {
  type: 'android.tap_selector',
  displayName: 'Tap element',
  description: 'Tap an Android element by selector.',
  category: 'ANDROID',
  runtimeHandler: 'android.tap_selector',
  minimumRuntimeVersion: '0.1.0',
  defaultTimeoutMs: 10_000,
  configSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'object',
        format: ANDROID_SELECTOR_V1_FORMAT,
        title: 'Target element',
        properties: {
          schemaVersion: { type: 'integer', const: 1 },
          strategy: { type: 'string', const: 'resourceId' },
          value: { type: 'string', minLength: 1 },
          packageName: { type: 'string', minLength: 1 },
        },
        required: ['schemaVersion', 'strategy', 'value'],
        additionalProperties: false,
      },
    },
    required: ['target'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  outputPorts: [],
  editorHints: { icon: 'mouse-pointer-click', fieldOrder: ['target'] },
  supportedErrorPolicies: ['STOP'],
  capabilities: [],
};

describe('node catalog workflow mapper', () => {
  it('preserves the Android selector marker and nested JSON schema', () => {
    const parsed = catalogNodeDefinitionSchema.parse(node);
    const [mapped] = toWorkflowNodeCatalog([parsed]);

    expect(mapped.properties.properties.target).toMatchObject({
      type: 'object',
      title: 'Target element',
      storage: 'binding',
      format: ANDROID_SELECTOR_V1_FORMAT,
      ui: { control: 'android-selector', order: 0 },
      jsonSchema: {
        format: ANDROID_SELECTOR_V1_FORMAT,
        required: ['schemaVersion', 'strategy', 'value'],
        additionalProperties: false,
      },
    });
  });
});
