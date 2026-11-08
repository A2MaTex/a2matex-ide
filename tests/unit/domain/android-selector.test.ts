import { describe, expect, it } from 'vitest';

import {
  ANDROID_SELECTOR_V1_FORMAT,
  createAndroidSelectorV1,
  getAndroidSelectorTargets,
  isAndroidSelectorV1,
} from '@domain/android-inspector/android-selector';
import type { WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { validateWorkflow } from '@domain/workflow/workflow-validator';

const definition: NodeDefinition = {
  type: 'android.tap_selector',
  version: 1,
  displayName: 'Tap element',
  description: 'Tap an Android element by selector.',
  category: 'Android',
  icon: 'mouse-pointer-click',
  inputs: [],
  outputs: [],
  properties: {
    type: 'object',
    required: ['target'],
    properties: {
      target: {
        type: 'object',
        title: 'Target',
        format: ANDROID_SELECTOR_V1_FORMAT,
        storage: 'binding',
        ui: { control: 'android-selector' },
      },
    },
  },
  requiredCapabilities: [],
  requiredPermissions: [],
  runtimeHandler: 'android.tap_selector',
  supportedErrorPolicies: ['STOP'],
};

const node: WorkflowNode = {
  id: 'tap-1',
  type: definition.type,
  config: {},
  editor: { x: 0, y: 0 },
  bindings: {},
  errorPolicy: 'STOP',
};

describe('Android selector v1', () => {
  it('creates a resource ID selector from an inspected hierarchy node', () => {
    expect(
      createAndroidSelectorV1({
        resourceId: 'com.example:id/submit',
        packageName: 'com.example',
      }),
    ).toEqual({
      schemaVersion: 1,
      strategy: 'resourceId',
      value: 'com.example:id/submit',
      packageName: 'com.example',
    });
    expect(createAndroidSelectorV1({ resourceId: '  ', packageName: 'com.example' })).toBeNull();
  });

  it('deep-validates version, strategy, value, package and unknown fields', () => {
    expect(
      isAndroidSelectorV1({
        schemaVersion: 1,
        strategy: 'resourceId',
        value: 'com.example:id/submit',
      }),
    ).toBe(true);
    expect(
      isAndroidSelectorV1({
        schemaVersion: 2,
        strategy: 'resourceId',
        value: 'com.example:id/submit',
      }),
    ).toBe(false);
    expect(
      isAndroidSelectorV1({
        schemaVersion: 1,
        strategy: 'resourceId',
        value: '',
      }),
    ).toBe(false);
    expect(
      isAndroidSelectorV1({
        schemaVersion: 1,
        strategy: 'resourceId',
        value: 'com.example:id/submit',
        snapshotId: 'snapshot-1',
      }),
    ).toBe(false);
  });

  it('discovers only explicitly marked workflow properties', () => {
    expect(getAndroidSelectorTargets(node, definition)).toEqual([
      {
        nodeId: 'tap-1',
        nodeLabel: 'Tap element',
        propertyName: 'target',
        propertyTitle: 'Target',
      },
    ]);
    expect(
      getAndroidSelectorTargets(node, {
        ...definition,
        properties: {
          ...definition.properties,
          properties: {
            target: { type: 'object', title: 'Target', storage: 'binding' },
          },
        },
      }),
    ).toEqual([]);
  });

  it('reports an invalid workflow property when selector internals are malformed', () => {
    const issues = validateWorkflow(
      {
        schemaVersion: 1,
        entryNodeId: 'tap-1',
        nodes: [
          {
            ...node,
            bindings: {
              target: {
                kind: 'constant',
                value: { schemaVersion: 1, strategy: 'resourceId', value: '' },
              },
            },
          },
        ],
        edges: [],
      },
      [definition],
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROPERTY_INVALID',
          nodeId: 'tap-1',
          propertyPath: 'bindings.target',
        }),
      ]),
    );
  });
});
