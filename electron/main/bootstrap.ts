import path from 'node:path';

import { app, BrowserWindow, session } from 'electron';

import { createAuthSessionService } from '@electron/main/auth/create-auth-session-service';
import { createNodeCatalogService } from '@electron/main/catalog/create-node-catalog-service';
import { registerAuthHandlers } from '@electron/main/ipc/register-auth-handlers';
import { registerNodeCatalogHandlers } from '@electron/main/ipc/register-node-catalog-handlers';
import { registerProjectHandlers } from '@electron/main/ipc/register-project-handlers';
import { registerSystemHandlers } from '@electron/main/ipc/register-system-handlers';
import { logMain } from '@electron/main/logger';

const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;

export function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#02060d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== window.webContents.getURL()) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(import.meta.dirname, '../../../dist/index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  registerSystemHandlers();
  const appPath = app.getAppPath();
  const userDataPath = app.getPath('userData');
  const auth = createAuthSessionService({
    appPath,
    userDataPath,
    isPackaged: app.isPackaged,
  });
  registerAuthHandlers(auth);
  registerNodeCatalogHandlers(
    createNodeCatalogService({
      appPath,
      userDataPath,
      isPackaged: app.isPackaged,
      auth,
    }),
  );
  registerProjectHandlers();
  createWindow();
  logMain('info', 'app_ready', { packaged: app.isPackaged });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logMain('error', 'uncaught_exception', { name: error.name });
});

process.on('unhandledRejection', (reason) => {
  logMain('error', 'unhandled_rejection', { reasonType: typeof reason });
});
