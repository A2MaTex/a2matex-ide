import { describe, expect, it } from 'vitest';

import { editProjectWorkflow } from '@application/workflow/edit-workflow';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { TEST_NODE_CATALOG } from '../fixtures/node-catalog';
import type { WorkflowDocument } from '@domain/project/project';
import {
  applyWorkflowCommand as applyWorkflowCommandWithCatalog,
  type WorkflowCommand,
  WorkflowCommandError,
} from '@domain/workflow/workflow-commands';
import { validateWorkflow } from '@domain/workflow/workflow-validator';

function applyWorkflowCommand(workflow: WorkflowDocument, command: WorkflowCommand) {
  return applyWorkflowCommandWithCatalog(workflow, command, TEST_NODE_CATALOG);
}

function emptyWorkflow(): WorkflowDocument {
  return createEmptyProjectDocument('project-1', 'Workflow test').workflows[
    'workflows/main.workflow.json'
  ];
}

function addNode(workflow: WorkflowDocument, nodeId: string, nodeType: string, x: number) {
  return applyWorkflowCommand(workflow, {
    type: 'node.add',
    payload: { nodeId, nodeType, nodeVersion: 1, position: { x, y: 80 } },
  });
}

function connect(workflow: WorkflowDocument, source: string, target: string) {
  return applyWorkflowCommand(workflow, {
    type: 'edge.connect',
    payload: {
      edgeId: source + '-' + target,
      source: { nodeId: source, port: 'next' },
      target: { nodeId: target, port: 'in' },
    },
  });
}

describe('workflow commands', () => {
  it('builds the four-node MVP workflow with catalog defaults', () => {
    let workflow = emptyWorkflow();
    workflow = addNode(workflow, 'start', 'trigger.start', 0);
    workflow = addNode(workflow, 'delay', 'flow.delay', 220);
    workflow = addNode(workflow, 'tap', 'android.tap', 440);
    workflow = addNode(workflow, 'log', 'debug.log', 660);
    workflow = connect(workflow, 'start', 'delay');
    workflow = connect(workflow, 'delay', 'tap');
    workflow = connect(workflow, 'tap', 'log');

    expect(workflow.nodes.map((node) => node.type)).toEqual([
      'trigger.start',
      'flow.delay',
      'android.tap',
      'debug.log',
    ]);
    expect(workflow.nodes[1].params).toEqual({ durationMs: 1000 });
    expect(workflow.edges).toHaveLength(3);
    expect(validateWorkflow(workflow, TEST_NODE_CATALOG, ['android.input'])).toEqual([]);
  });

  it('rejects a connection that would create a cycle', () => {
    let workflow = addNode(emptyWorkflow(), 'delay', 'flow.delay', 0);
    workflow = addNode(workflow, 'log', 'debug.log', 220);
    workflow = connect(workflow, 'delay', 'log');

    expect(() =>
      applyWorkflowCommand(workflow, {
        type: 'edge.connect',
        payload: {
          edgeId: 'cycle',
          source: { nodeId: 'log', port: 'next' },
          target: { nodeId: 'delay', port: 'in' },
        },
      }),
    ).toThrowError(expect.objectContaining<WorkflowCommandError>({ code: 'GRAPH_CYCLE' }));
  });

  it('removes connected edges and layout with a node', () => {
    let workflow = addNode(emptyWorkflow(), 'start', 'trigger.start', 0);
    workflow = addNode(workflow, 'delay', 'flow.delay', 220);
    workflow = connect(workflow, 'start', 'delay');
    workflow = applyWorkflowCommand(workflow, {
      type: 'node.remove',
      payload: { nodeId: 'delay' },
    });

    expect(workflow.nodes.map((node) => node.id)).toEqual(['start']);
    expect(workflow.edges).toEqual([]);
    expect(workflow.layout.nodes).not.toHaveProperty('delay');
  });

  it('derives manifest permissions from edited workflows', () => {
    const project = createEmptyProjectDocument('project-1', 'Permission test');
    const edited = editProjectWorkflow(
      project,
      project.manifest.entryWorkflow,
      {
        type: 'node.add',
        payload: {
          nodeId: 'tap',
          nodeType: 'android.tap',
          nodeVersion: 1,
          position: { x: 0, y: 0 },
        },
      },
      TEST_NODE_CATALOG,
    );

    expect(edited.manifest.permissions).toEqual([
      { id: 'android.input', reason: 'Required by workflow node' },
    ]);
  });
});

describe('workflow validator', () => {
  it('reports stable entry, property, and required-input issues', () => {
    let workflow = addNode(emptyWorkflow(), 'delay', 'flow.delay', 0);
    workflow = applyWorkflowCommand(workflow, {
      type: 'node.updateParams',
      payload: { nodeId: 'delay', changes: { durationMs: -1 } },
    });

    const issues = validateWorkflow(workflow, TEST_NODE_CATALOG);

    expect(issues.map((entry) => entry.code)).toEqual([
      'ENTRY_TRIGGER_COUNT',
      'INPUT_REQUIRED',
      'PROPERTY_INVALID',
    ]);
    expect(issues.every((entry) => entry.id.startsWith('main:'))).toBe(true);
  });
});
