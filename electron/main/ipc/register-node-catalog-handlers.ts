import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  NodeCatalogError,
  type NodeCatalogClient,
  type NodeCatalogErrorCode,
  toNodeCatalogError,
} from '@application/node-catalog/node-catalog';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

function success<T>(value: T): HostResult<T, NodeCatalogErrorCode> {
  return { ok: true, value };
}

function failure(error: unknown): HostResult<never, NodeCatalogErrorCode> {
  const mapped = toNodeCatalogError(error);
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

function handle(channel: string, handler: (runtimeVersion: string) => Promise<unknown>) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, runtimeVersion: unknown) => {
    try {
      assertTrustedSender(event);
      if (typeof runtimeVersion !== 'string') {
        throw new NodeCatalogError(
          'CATALOG_INVALID_INPUT',
          'Runtime version must be a string.',
          false,
        );
      }
      return success(await handler(runtimeVersion));
    } catch (error) {
      return failure(error);
    }
  });
}

export function registerNodeCatalogHandlers(catalog: NodeCatalogClient) {
  handle(IPC_CHANNELS.catalogLoad, (runtimeVersion) => catalog.load(runtimeVersion));
  handle(IPC_CHANNELS.catalogRefresh, (runtimeVersion) => catalog.refresh(runtimeVersion));
}
