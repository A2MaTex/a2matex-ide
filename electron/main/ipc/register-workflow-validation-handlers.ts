import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  WorkflowValidationError,
  toWorkflowValidationError,
  workflowValidationInputSchema,
  type WorkflowValidationClient,
  type WorkflowValidationErrorCode,
} from '@application/workflow-validation/workflow-validation';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

function failure(error: unknown): HostResult<never, WorkflowValidationErrorCode> {
  const mapped = toWorkflowValidationError(error);
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

export function registerWorkflowValidationHandlers(client: WorkflowValidationClient) {
  ipcMain.removeHandler(IPC_CHANNELS.workflowValidationValidate);
  ipcMain.handle(IPC_CHANNELS.workflowValidationValidate, async (event, rawInput: unknown) => {
    try {
      assertTrustedSender(event);
      const parsed = workflowValidationInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_INVALID_REQUEST',
          'Workflow validation requires a JSON object named editorGraph and no extra fields.',
          false,
        );
      }
      return { ok: true, value: await client.validate(parsed.data) };
    } catch (error) {
      return failure(error);
    }
  });
}
