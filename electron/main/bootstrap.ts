import path from 'node:path';

import { app, BrowserWindow, session } from 'electron';

import { registerProjectHandlers } from './ipc/register-project-handlers.js';
import { registerSystemHandlers } from './ipc/register-system-handlers.js';
import { logMain } from './logger.js';

const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;

export function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#080b10',
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
