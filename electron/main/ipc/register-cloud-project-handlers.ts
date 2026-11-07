import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  CloudProjectError,
  type CloudProjectErrorCode,
  type ProjectCloudClient,
  type UpdateCloudProjectInput,
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
  handle(IPC_CHANNELS.cloudProjectOpen, (projectId) =>
    cloud.open(requireString(projectId, 'Project ID')),
  );
  handle(IPC_CHANNELS.cloudProjectRefresh, () => cloud.refresh());
  handle(IPC_CHANNELS.cloudProjectDetail, (projectId) =>
    cloud.getDetail(requireString(projectId, 'Project ID')),
  );
  handle(IPC_CHANNELS.cloudProjectUpdate, (rawInput) => {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Project update is required.', false);
    }
    const projectId = requireString(Reflect.get(rawInput, 'projectId'), 'Project ID');
    const rawLocalId = Reflect.get(rawInput, 'localId');
    const localId = rawLocalId === undefined ? undefined : requireString(rawLocalId, 'Local ID');
    const update = Reflect.get(rawInput, 'update');
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Project update is required.', false);
    }
    return cloud.update(projectId, update as UpdateCloudProjectInput, localId);
  });
  handle(IPC_CHANNELS.cloudProjectArchive, (projectId) =>
    cloud.archive(requireString(projectId, 'Project ID')),
  );
  handle(IPC_CHANNELS.cloudProjectSync, (localId) => {
    if (typeof localId !== 'string') {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project ID is required.', false);
    }
    return cloud.sync(localId);
  });
  handle(IPC_CHANNELS.cloudProjectUpdateFromCloud, (localId) =>
    cloud.updateFromCloud(requireString(localId, 'Local project ID')),
  );
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CloudProjectError('CLOUD_INVALID_INPUT', `${label} is required.`, false);
  }
  return value;
}
