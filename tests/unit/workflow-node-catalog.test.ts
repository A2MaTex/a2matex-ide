import { describe, expect, it } from 'vitest';

import { toWorkflowNodeCatalog } from '@application/node-catalog/to-workflow-node-catalog';
import type { CatalogNodeDefinition } from '@domain/node-catalog/node-catalog';

const node: CatalogNodeDefinition = {
  type: 'android.input_text',
  displayName: 'Input Text',
  description: 'Enter text into the currently focused Android field.',
  category: 'ANDROID',
  runtimeHandler: 'android.input_text',
  minimumRuntimeVersion: '0.1.0',
  defaultTimeoutMs: 30_000,
  configSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', maxLength: 10_000 },
    },
    required: ['text'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  outputPorts: [
    { key: 'success', kind: 'CONTROL', label: 'Success' },
    { key: 'error', kind: 'ERROR', label: 'Error' },
  ],
  editorHints: { icon: 'keyboard', fieldOrder: ['text'] },
  supportedErrorPolicies: ['STOP', 'ERROR_BRANCH'],
  capabilities: [
    {
      code: 'android.device.control',
      name: 'Android Device Control',
      description: 'Controls an Android device.',
      isSensitive: true,
    },
  ],
};

describe('workflow node catalog adapter', () => {
  it('maps API name, description, fields and ports for the editor', () => {
    expect(toWorkflowNodeCatalog([node])).toEqual([
      expect.objectContaining({
        type: 'android.input_text',
        version: 1,
        displayName: 'Input Text',
        description: node.description,
        category: 'Android',
        icon: 'keyboard',
        inputs: [expect.objectContaining({ name: 'in', direction: 'input' })],
        outputs: [
          expect.objectContaining({ name: 'success', label: 'Success' }),
          expect.objectContaining({ name: 'error', label: 'Error' }),
        ],
        properties: {
          type: 'object',
          required: ['text'],
          properties: {
            text: expect.objectContaining({ type: 'string', title: 'Text' }),
          },
        },
      }),
    ]);
  });

  it('maps backend categories for palette grouping', () => {
    const mapped = toWorkflowNodeCatalog([
      { ...node, type: 'flow.delay', category: 'FLOW' },
      { ...node, type: 'utility.log', category: 'UTILITY' },
      node,
    ]);

    expect(mapped.map(({ type, category }) => ({ type, category }))).toEqual([
      { type: 'flow.delay', category: 'Flow' },
      { type: 'utility.log', category: 'Utility' },
      { type: 'android.input_text', category: 'Android' },
    ]);
  });
});
