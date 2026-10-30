import { app, ipcMain } from 'electron';

import type { HostInfo } from '@application/system/host-gateway';
import { IPC_CHANNELS } from '@electron/shared/channels';

export function registerSystemHandlers() {
  ipcMain.removeHandler(IPC_CHANNELS.systemGetInfo);
  ipcMain.handle(IPC_CHANNELS.systemGetInfo, (): HostInfo => {
    return {
      appVersion: app.getVersion(),
      environment: app.isPackaged ? 'production' : 'development',
      platform: process.platform,
      runtime: 'desktop',
    };
  });
}
