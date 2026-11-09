import { describe, expect, it } from 'vitest';

import type { WorkflowDocument } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import {
  toReactFlowEdges,
  toReactFlowNodes,
} from '@presentation/features/workflow-editor/react-flow-adapter';

const definition: NodeDefinition = {
  type: 'utility.action',
  version: 2,
  displayName: 'Action',
  description: 'Does something.',
  category: 'Utility',
  icon: 'settings',
  inputs: [],
  outputs: [],
  properties: { type: 'object', properties: {} },
  requiredCapabilities: [],
  requiredPermissions: [],
  runtimeHandler: 'utility.action',
  supportedErrorPolicies: ['STOP'],
};

const workflow: WorkflowDocument = {
  schemaVersion: 1,
  entryNodeId: 'node-1',
  nodes: [
    {
      id: 'node-1',
      type: definition.type,
      name: 'Custom action',
      labelMode: 'icon',
      disabled: true,
      config: {},
      editor: { x: 10, y: 20 },
      bindings: {},
      errorPolicy: 'STOP',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      sourcePort: 'success',
      targetNodeId: 'node-2',
      targetPort: 'custom-input',
    },
  ],
};

describe('workflow React Flow adapter', () => {
  it('projects effective labels and appearance metadata', () => {
    expect(toReactFlowNodes(workflow, 'node-1', [], [definition])[0]).toMatchObject({
      selected: true,
      data: { displayName: 'Custom action', labelMode: 'icon', disabled: true },
    });
  });

  it('preserves target ports and selected edges', () => {
    expect(toReactFlowEdges(workflow, 'edge-1')[0]).toMatchObject({
      sourceHandle: 'out',
      targetHandle: 'in',
      selected: true,
      reconnectable: true,
    });
  });
});
