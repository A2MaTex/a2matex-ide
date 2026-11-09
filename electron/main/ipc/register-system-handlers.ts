import { app, ipcMain, shell } from 'electron';

import { isTrustedPolicyUrl } from '@application/onboarding/policy-manifest';
import type { HostInfo } from '@application/system/host-gateway';
import { IPC_CHANNELS } from '@electron/shared/channels';

export function registerSystemHandlers() {
  ipcMain.removeHandler(IPC_CHANNELS.systemGetInfo);
  ipcMain.removeHandler(IPC_CHANNELS.systemOpenExternal);
  ipcMain.removeHandler(IPC_CHANNELS.systemQuit);
  ipcMain.handle(IPC_CHANNELS.systemGetInfo, (): HostInfo => {
    return {
      appVersion: app.getVersion(),
      environment: app.isPackaged ? 'production' : 'development',
      platform: process.platform,
      runtime: 'desktop',
    };
  });
  ipcMain.handle(IPC_CHANNELS.systemOpenExternal, async (_event, value: unknown) => {
    if (!isTrustedPolicyUrl(value)) return false;
    await shell.openExternal(value);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.systemQuit, () => {
    setImmediate(() => app.quit());
  });
}
