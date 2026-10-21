import { describe, expect, it } from 'vitest';

import { isProjectDirty } from '@application/project/project-session';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { TEST_NODE_CATALOG } from '../fixtures/node-catalog';
import { applyWorkflowCommand } from '@domain/workflow/workflow-commands';
import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';
import {
  applyReactFlowPositions,
  toReactFlowEdges,
  toReactFlowNodes,
} from '@presentation/features/workflow-editor/react-flow-adapter';
import { createProjectStore } from '@presentation/stores/project-store';

describe('React Flow adapter', () => {
  it('projects graph data and only writes layout positions back', () => {
    const project = createEmptyProjectDocument('project-1', 'Adapter test');
    const path = project.manifest.entryWorkflow;
    let workflow = project.workflows[path];
    workflow = applyWorkflowCommand(
      workflow,
      {
        type: 'node.add',
        payload: {
          nodeId: 'start',
          nodeType: 'trigger.start',
          nodeVersion: 1,
          position: { x: 10, y: 20 },
        },
      },
      TEST_NODE_CATALOG,
    );
    const nodes = toReactFlowNodes(workflow, 'start', [], TEST_NODE_CATALOG);
    const moved = applyReactFlowPositions(workflow, [
      { ...nodes[0], position: { x: 300, y: 180 } },
    ]);

    expect(nodes[0]).toMatchObject({
      id: 'start',
      type: 'automation',
      selected: true,
      position: { x: 10, y: 20 },
    });
    expect(toReactFlowEdges(workflow)).toEqual([]);
    expect(moved.nodes).toEqual(workflow.nodes);
    expect(moved.edges).toEqual(workflow.edges);
    expect(moved.layout.nodes.start).toEqual({ x: 300, y: 180 });
  });
});

describe('workflow history', () => {
  it('undoes to the saved revision and restores dirty state on redo', async () => {
    const store = createProjectStore(new InMemoryProjectRepository());
    const created = await store.getState().create('History test');
    expect(created).not.toBeNull();
    const path = created!.document.manifest.entryWorkflow;

    expect(
      store.getState().executeWorkflowCommand(
        path,
        {
          type: 'node.add',
          payload: {
            nodeId: 'start',
            nodeType: 'trigger.start',
            nodeVersion: 1,
            position: { x: 0, y: 0 },
          },
        },
        TEST_NODE_CATALOG,
      ),
    ).toBe(true);
    await store.getState().save();
    expect(isProjectDirty(store.getState().session!)).toBe(false);

    store.getState().executeWorkflowCommand(
      path,
      {
        type: 'node.add',
        payload: {
          nodeId: 'delay',
          nodeType: 'flow.delay',
          nodeVersion: 1,
          position: { x: 220, y: 0 },
        },
      },
      TEST_NODE_CATALOG,
    );
    expect(isProjectDirty(store.getState().session!)).toBe(true);

    store.getState().undo();
    expect(store.getState().session!.snapshot.document.workflows[path].nodes).toHaveLength(1);
    expect(isProjectDirty(store.getState().session!)).toBe(false);

    store.getState().redo();
    expect(store.getState().session!.snapshot.document.workflows[path].nodes).toHaveLength(2);
    expect(isProjectDirty(store.getState().session!)).toBe(true);
  });
});
