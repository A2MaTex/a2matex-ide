import { describe, expect, it } from 'vitest';

import type { WorkflowDocument } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { applyWorkflowCommand, WorkflowCommandError } from '@domain/workflow/workflow-commands';

const startDefinition: NodeDefinition = {
  type: 'flow.start',
  version: 1,
  displayName: 'Start',
  description: 'Starts the workflow.',
  category: 'Flow',
  icon: 'play',
  inputs: [],
  outputs: [
    {
      name: 'success',
      label: 'Success',
      direction: 'output',
      kind: 'control',
      valueType: 'flow',
      cardinality: 'many',
    },
  ],
  properties: { type: 'object', properties: {} },
  requiredCapabilities: [],
  requiredPermissions: [],
  runtimeHandler: 'flow.start',
  supportedErrorPolicies: ['STOP'],
};

const actionDefinition: NodeDefinition = {
  ...startDefinition,
  type: 'utility.action',
  displayName: 'Action',
  runtimeHandler: 'utility.action',
  inputs: [
    {
      name: 'in',
      label: 'In',
      direction: 'input',
      kind: 'control',
      valueType: 'flow',
      cardinality: 'many',
      required: true,
    },
  ],
};

const catalog = [startDefinition, actionDefinition];

function workflow(): WorkflowDocument {
  return {
    schemaVersion: 1,
    entryNodeId: 'start',
    nodes: [
      {
        id: 'start',
        type: 'flow.start',
        config: {},
        editor: { x: 0, y: 0 },
        bindings: {},
        errorPolicy: 'STOP',
      },
      ...['a', 'b', 'c'].map((id, index) => ({
        id,
        type: 'utility.action',
        config: {},
        editor: { x: index * 100 + 100, y: 0 },
        bindings: {},
        errorPolicy: 'STOP' as const,
      })),
    ],
    edges: [],
  };
}

function connect(document: WorkflowDocument, edgeId: string, source: string, target: string) {
  return applyWorkflowCommand(
    document,
    {
      type: 'edge.connect',
      payload: {
        edgeId,
        source: { nodeId: source, port: 'success' },
        target: { nodeId: target, port: 'in' },
      },
    },
    catalog,
  );
}

describe('workflow commands for editor UX', () => {
  it('allows ordered fan-out from one output port', () => {
    const first = connect(workflow(), 'edge-1', 'start', 'a');
    const second = connect(first, 'edge-2', 'start', 'b');
    const third = connect(second, 'edge-3', 'start', 'c');

    expect(third.edges.map((edge) => edge.id)).toEqual(['edge-1', 'edge-2', 'edge-3']);
  });

  it('allows fan-in to one input port while still rejecting exact duplicates', () => {
    const first = connect(workflow(), 'edge-1', 'start', 'c');
    const second = connect(first, 'edge-2', 'a', 'c');
    expect(second.edges).toHaveLength(2);

    expect(() => connect(second, 'edge-3', 'a', 'c')).toThrowError(
      expect.objectContaining<Partial<WorkflowCommandError>>({ code: 'DUPLICATE_EDGE' }),
    );
  });

  it('adds a node and its connection atomically', () => {
    const result = applyWorkflowCommand(
      workflow(),
      {
        type: 'node.addConnected',
        payload: {
          nodeId: 'new-node',
          nodeType: 'utility.action',
          nodeVersion: 1,
          position: { x: 250, y: 80 },
          edgeId: 'new-edge',
          source: { nodeId: 'start', port: 'success' },
          targetPort: 'in',
        },
      },
      catalog,
    );

    expect(result.nodes.at(-1)).toMatchObject({
      id: 'new-node',
      editor: { x: 250, y: 80 },
    });
    expect(result.edges.at(-1)).toMatchObject({
      id: 'new-edge',
      targetNodeId: 'new-node',
      targetPort: 'in',
    });
  });

  it('reconnects in place without changing edge execution order', () => {
    const original = connect(connect(workflow(), 'edge-1', 'start', 'a'), 'edge-2', 'start', 'b');
    const result = applyWorkflowCommand(
      original,
      {
        type: 'edge.reconnect',
        payload: {
          edgeId: 'edge-1',
          source: { nodeId: 'start', port: 'success' },
          target: { nodeId: 'c', port: 'in' },
        },
      },
      catalog,
    );

    expect(result.edges.map((edge) => edge.id)).toEqual(['edge-1', 'edge-2']);
    expect(result.edges[0]).toMatchObject({ targetNodeId: 'c', targetPort: 'in' });
  });

  it('keeps the original document untouched when reconnection is invalid', () => {
    const original = connect(workflow(), 'edge-1', 'start', 'a');
    expect(() =>
      applyWorkflowCommand(
        original,
        {
          type: 'edge.reconnect',
          payload: {
            edgeId: 'edge-1',
            source: { nodeId: 'a', port: 'success' },
            target: { nodeId: 'start', port: 'in' },
          },
        },
        catalog,
      ),
    ).toThrow();
    expect(original.edges[0]).toMatchObject({ sourceNodeId: 'start', targetNodeId: 'a' });
  });

  it('deletes only the selected connection and keeps both endpoint nodes', () => {
    const original = connect(workflow(), 'edge-1', 'start', 'a');
    const result = applyWorkflowCommand(
      original,
      { type: 'edge.remove', payload: { edgeId: 'edge-1' } },
      catalog,
    );

    expect(result.edges).toEqual([]);
    expect(result.nodes.map((node) => node.id)).toEqual(original.nodes.map((node) => node.id));
  });

  it('normalizes node metadata in one command', () => {
    const result = applyWorkflowCommand(
      workflow(),
      {
        type: 'node.updateMetadata',
        payload: {
          nodeId: 'a',
          name: '  Retry login  ',
          labelMode: 'icon',
          description: 'Purpose\r\nDetails',
          disabled: true,
        },
      },
      catalog,
    );

    expect(result.nodes.find((node) => node.id === 'a')).toMatchObject({
      name: 'Retry login',
      labelMode: 'icon',
      description: 'Purpose\nDetails',
      disabled: true,
    });
  });
});
