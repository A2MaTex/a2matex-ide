import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { NodeDetailDialog } from '@presentation/features/workflow-editor/NodeDetailDialog';

afterEach(cleanup);

const definition: NodeDefinition = {
  type: 'utility.action',
  version: 1,
  displayName: 'Action',
  description: 'Does something.',
  category: 'Utility',
  icon: 'settings',
  inputs: [
    {
      name: 'in',
      label: 'In',
      direction: 'input',
      kind: 'control',
      valueType: 'flow',
      cardinality: 'many',
    },
  ],
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
  runtimeHandler: 'utility.action',
  supportedErrorPolicies: ['STOP'],
};

const node: WorkflowNode = {
  id: 'node-1',
  type: definition.type,
  config: {},
  editor: { x: 0, y: 0 },
  bindings: {},
  errorPolicy: 'STOP',
};

function renderDialog() {
  const execute = vi.fn(() => true);
  const onClose = vi.fn();
  render(
    <NodeDetailDialog
      node={node}
      definition={definition}
      execute={execute}
      onHelp={() => undefined}
      onDelete={() => undefined}
      onClose={onClose}
    />,
  );
  return { execute, onClose };
}

describe('NodeDetailDialog', () => {
  it('cancels without committing its local draft', async () => {
    const user = userEvent.setup();
    const { execute, onClose } = renderDialog();
    await user.type(screen.getByLabelText('Name'), 'Draft name');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(execute).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('commits metadata and disabled state as one combined command', async () => {
    const user = userEvent.setup();
    const { execute } = renderDialog();
    await user.type(screen.getByLabelText('Name'), 'Retry login');
    await user.click(screen.getByLabelText('Icon only'));
    await user.click(screen.getByRole('button', { name: 'Enabled' }));
    await user.click(screen.getByRole('button', { name: 'Description' }));
    await user.type(screen.getByLabelText('Markdown description'), 'Purpose');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: 'node.updateMetadata',
      payload: {
        nodeId: 'node-1',
        name: 'Retry login',
        labelMode: 'icon',
        description: 'Purpose',
        disabled: true,
      },
    });
  });
});
