import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  type AuthClient,
  type AuthErrorCode,
  type LoginInput,
  toAuthError,
} from '@application/auth/auth-session';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

function success<T>(value: T): HostResult<T, AuthErrorCode> {
  return { ok: true, value };
}

function failure(error: unknown): HostResult<never, AuthErrorCode> {
  const mapped = toAuthError(error);
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

function handle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>,
) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, input) => {
    try {
      assertTrustedSender(event);
      return success(await handler(event, input));
    } catch (error) {
      return failure(error);
    }
  });
}

export function registerAuthHandlers(auth: AuthClient) {
  handle(IPC_CHANNELS.authRestore, () => auth.restore());
  handle(IPC_CHANNELS.authLogin, (_event, input) => auth.login(input as LoginInput));
  handle(IPC_CHANNELS.authLogout, () => auth.logout());
}
