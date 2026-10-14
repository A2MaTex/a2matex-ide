import { app, ipcMain } from 'electron';

import type { HostInfo } from '../../../src/application/system/host-gateway.js';
import { IPC_CHANNELS } from '../../shared/channels.js';

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
