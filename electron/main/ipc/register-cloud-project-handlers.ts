import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  CloudProjectError,
  type CloudProjectErrorCode,
  type ProjectCloudClient,
} from '@application/project/project-cloud';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

function failure(error: unknown): HostResult<never, CloudProjectErrorCode> {
  const mapped =
    error instanceof CloudProjectError
      ? error
      : new CloudProjectError(
          'CLOUD_SERVER_ERROR',
          'The cloud project operation failed.',
          true,
          undefined,
          { cause: error },
        );
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

function handle(channel: string, operation: (input: unknown) => Promise<unknown>) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, input) => {
    try {
      assertTrustedSender(event);
      return { ok: true, value: await operation(input) };
    } catch (error) {
      return failure(error);
    }
  });
}

export function registerCloudProjectHandlers(cloud: ProjectCloudClient) {
  handle(IPC_CHANNELS.cloudProjectLoad, () => cloud.load());
  handle(IPC_CHANNELS.cloudProjectRefresh, () => cloud.refresh());
  handle(IPC_CHANNELS.cloudProjectSyncFirst, (localId) => {
    if (typeof localId !== 'string') {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project ID is required.', false);
    }
    return cloud.syncFirst(localId);
  });
}
