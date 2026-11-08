import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowNode } from '@domain/project/project';
import { ANDROID_SELECTOR_V1_FORMAT } from '@domain/android-inspector/android-selector';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { NodeConfigDrawer } from '@presentation/features/workflow-editor/NodeConfigDrawer';

afterEach(cleanup);

const definition: NodeDefinition = {
  type: 'android.tap',
  version: 1,
  displayName: 'Tap',
  description: 'Tap an Android element.',
  category: 'Android',
  icon: 'mouse-pointer-click',
  inputs: [],
  outputs: [],
  properties: {
    type: 'object',
    required: [],
    properties: {
      target: { type: 'string', title: 'Target', storage: 'config' },
      selector: {
        type: 'object',
        title: 'Element selector',
        format: ANDROID_SELECTOR_V1_FORMAT,
        storage: 'config',
        ui: { control: 'android-selector' },
      },
    },
  },
  requiredCapabilities: [],
  requiredPermissions: [],
  runtimeHandler: 'android.tap',
  supportedErrorPolicies: ['STOP'],
};

const node: WorkflowNode = {
  id: 'node-1',
  type: definition.type,
  config: {
    target: 'before',
    selector: {
      schemaVersion: 1,
      strategy: 'resourceId',
      value: 'com.example:id/before',
      packageName: 'com.example',
    },
  },
  editor: { x: 0, y: 0 },
  bindings: {},
  errorPolicy: 'STOP',
};

function renderDrawer(onClose = vi.fn(), execute = vi.fn(() => true)) {
  render(
    <>
      <button type="button">Outside target</button>
      <NodeConfigDrawer
        open
        catalog={[definition]}
        node={node}
        issues={[]}
        execute={execute}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onClose={onClose}
      />
    </>,
  );
  return { execute, onClose };
}

describe('NodeConfigDrawer', () => {
  it('does not close when interacting inside the drawer', () => {
    const { onClose } = renderDrawer();

    fireEvent.pointerDown(screen.getByLabelText('Node configuration'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on an outside pointer interaction', () => {
    const { onClose } = renderDrawer();

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', () => {
    const { onClose } = renderDrawer();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the active field mounted long enough to commit its blur change on dismissal', async () => {
    const user = userEvent.setup();
    const { execute } = renderDrawer();
    const input = screen.getByLabelText('Target');

    await user.clear(input);
    await user.type(input, 'after');
    await user.click(screen.getByRole('button', { name: 'Outside target' }));

    expect(execute).toHaveBeenCalledWith({
      type: 'node.updateParams',
      payload: { nodeId: 'node-1', changes: { target: 'after' } },
    });
  });

  it('renders and edits a structured Android selector without stringifying the object', async () => {
    const user = userEvent.setup();
    const { execute } = renderDrawer();
    const resourceId = screen.getByLabelText('Resource ID');

    expect(resourceId).toHaveValue('com.example:id/before');
    expect(screen.queryByDisplayValue('[object Object]')).not.toBeInTheDocument();
    await user.clear(resourceId);
    await user.type(resourceId, 'com.example:id/after');
    await user.tab();

    expect(execute).toHaveBeenCalledWith({
      type: 'node.updateParams',
      payload: {
        nodeId: 'node-1',
        changes: {
          selector: {
            schemaVersion: 1,
            strategy: 'resourceId',
            value: 'com.example:id/after',
            packageName: 'com.example',
          },
        },
      },
    });
  });
});
