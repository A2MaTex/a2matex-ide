import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from '@presentation/stores/editor-store';

beforeEach(() => useEditorStore.getState().resetWorkflowSession());

describe('editor store node configuration drawer', () => {
  it('opens the drawer when a node is selected', () => {
    useEditorStore.getState().selectNode('node-1');

    expect(useEditorStore.getState()).toMatchObject({
      selectedNodeId: 'node-1',
      nodeConfigDrawerOpen: true,
    });
  });

  it('closes the drawer without clearing node selection', () => {
    useEditorStore.getState().selectNode('node-1');
    useEditorStore.getState().closeNodeConfigDrawer();

    expect(useEditorStore.getState()).toMatchObject({
      selectedNodeId: 'node-1',
      nodeConfigDrawerOpen: false,
    });
  });

  it('reopens the drawer when the selected node is selected again', () => {
    useEditorStore.getState().selectNode('node-1');
    useEditorStore.getState().closeNodeConfigDrawer();
    useEditorStore.getState().selectNode('node-1');

    expect(useEditorStore.getState().nodeConfigDrawerOpen).toBe(true);
  });

  it('clears both selection and drawer state with the workflow session', () => {
    useEditorStore.getState().selectNode('node-1');
    useEditorStore.getState().resetWorkflowSession();

    expect(useEditorStore.getState()).toMatchObject({
      selectedNodeId: null,
      nodeConfigDrawerOpen: false,
    });
  });
});
