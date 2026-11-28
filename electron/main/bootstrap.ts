import path from 'node:path';

import { app, BrowserWindow, dialog, session } from 'electron';

import { createAuthSessionService } from '@electron/main/auth/create-auth-session-service';
import { accountScopeFromName } from '@application/auth/account-scope';
import type { MainAuthSession } from '@application/auth/auth-session';
import { RuntimeError } from '@application/runtime/runtime.error';
import type { RuntimeOperations } from '@application/runtime/runtime.types';
import { getCurrentPolicies } from '@electron/main/api/policy.api';
import { ProcessAdbClient } from '@electron/main/adapters/android/adb-client';
import { SqliteCloudProjectCache } from '@electron/main/adapters/project/sqlite-cloud-project-cache';
import { SqliteLocalProjectRepository } from '@electron/main/adapters/project/sqlite-local-project-repository';
import { createNodeCatalogService } from '@electron/main/catalog/create-node-catalog-service';
import { registerAuthHandlers } from '@electron/main/ipc/register-auth-handlers';
import { registerAndroidInspectorHandlers } from '@electron/main/ipc/register-android-inspector-handlers';
import { registerCloudProjectHandlers } from '@electron/main/ipc/register-cloud-project-handlers';
import { registerNodeCatalogHandlers } from '@electron/main/ipc/register-node-catalog-handlers';
import { registerOnboardingHandlers } from '@electron/main/ipc/register-onboarding-handlers';
import { registerProjectHandlers } from '@electron/main/ipc/register-project-handlers';
import { registerRuntimeHandlers } from '@electron/main/ipc/register-runtime-handlers';
import { registerSystemHandlers } from '@electron/main/ipc/register-system-handlers';
import { loadApiConfig } from '@electron/main/config/api-config';
import { logMain } from '@electron/main/logger';
import { createProjectCloudService } from '@electron/main/project/create-project-cloud-service';
import { DefaultAndroidInspectorService } from '@electron/main/services/android-inspector/android-inspector-service';
import {
  OnboardingError,
  OnboardingStateService,
} from '@electron/main/services/onboarding-state-service';
import {
  openStudioDatabase,
  type StudioDatabase,
} from '@electron/main/persistence/studio-database';
import { createRuntimeServices } from '@electron/main/runtime/create-runtime-services';
import { resolveRuntimeExecutable } from '@electron/main/runtime/process/runtime-executable';
import { RuntimeProcessManager } from '@electron/main/runtime/process/runtime-process-manager';
import {
  RuntimeRunCoordinator,
  RuntimeRunCoordinatorError,
} from '@electron/main/runtime/run/runtime-run-coordinator';

const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
let studioDatabase: StudioDatabase | null = null;
let runtimeManager: RuntimeProcessManager | null = null;
let runtimeServices: RuntimeOperations | null = null;
let runtimeRuns: RuntimeRunCoordinator | null = null;
let quitInProgress = false;
let shutdownComplete = false;

function requestApplicationQuit(parent?: BrowserWindow) {
  if (shutdownComplete || quitInProgress) return;
  if (runtimeRuns?.hasUnresolvedRun() || runtimeServices?.hasUnresolvedControl()) {
    const options = {
      type: 'warning' as const,
      buttons: ['Stay open', 'Stop and exit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Runtime work is still active',
      message: 'Stop managed Runtime work and exit A2MaTeX Studio?',
      detail:
        'Staying open keeps the window, managed Runtime, pending controls and execution running.',
    };
    const choice = parent
      ? dialog.showMessageBoxSync(parent, options)
      : dialog.showMessageBoxSync(options);
    if (choice === 0) return;
  }

  quitInProgress = true;
  runtimeServices?.suppressAutomaticWork(true);
  runtimeManager?.suppressAutomaticWork(true);
  void (async () => {
    try {
      if (runtimeServices) await runtimeServices.shutdown();
      else await runtimeManager?.shutdown();
    } catch (error) {
      logMain('error', 'runtime_shutdown_failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      dialog.showErrorBox(
        'Managed Runtime shutdown encountered an error',
        'Studio stopped automatic Runtime work and will now exit. Check the application logs before starting another local execution.',
      );
    } finally {
      studioDatabase?.close();
      studioDatabase = null;
      runtimeServices = null;
      runtimeManager = null;
      runtimeRuns = null;
      shutdownComplete = true;
      app.quit();
    }
  })();
}

async function requireRuntimeAccountScope(auth: MainAuthSession) {
  const restored = await auth.restore();
  if (restored.status !== 'authenticated') {
    throw new RuntimeRunCoordinatorError(
      'PROJECT_ACCOUNT_UNAVAILABLE',
      'Sign in before preparing a Test Run for a local project.',
      false,
    );
  }
  return accountScopeFromName(restored.account);
}

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
  window.on('close', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    requestApplicationQuit(window);
  });

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
  registerAndroidInspectorHandlers(new DefaultAndroidInspectorService(new ProcessAdbClient()));
  const appPath = app.getAppPath();
  const userDataPath = app.getPath('userData');
  let loadPolicies;
  try {
    const apiConfig = loadApiConfig({ appPath, isPackaged: app.isPackaged });
    loadPolicies = () => getCurrentPolicies(apiConfig.baseUrl, apiConfig.timeoutMs);
  } catch {
    loadPolicies = () =>
      Promise.reject(
        new OnboardingError(
          'ONBOARDING_CONFIGURATION_INVALID',
          'The A2MaTeX API is not configured.',
        ),
      );
  }
  registerOnboardingHandlers(new OnboardingStateService(userDataPath), loadPolicies);
  const auth = createAuthSessionService({
    appPath,
    userDataPath,
    isPackaged: app.isPackaged,
  });
  registerAuthHandlers(auth);
  const manager = new RuntimeProcessManager({
    resolveExecutable: () =>
      resolveRuntimeExecutable({
        appPath,
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
      }),
  });
  runtimeManager = manager;
  const runtime = createRuntimeServices(manager);
  runtimeServices = runtime;
  try {
    studioDatabase = openStudioDatabase({
      migrationsPath: path.join(appPath, 'prisma', 'migration'),
      userDataPath,
    });
  } catch (error) {
    logMain('error', 'local_database_initialization_failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    dialog.showErrorBox(
      'A2MateX Studio could not open local projects',
      'The local database could not be initialized. Your project files were not overwritten. Check the application logs or restore the pre-migration backup before reopening Studio.',
    );
    app.quit();
    return;
  }
  registerNodeCatalogHandlers(
    createNodeCatalogService({
      appPath,
      userDataPath,
      isPackaged: app.isPackaged,
      auth,
    }),
  );
  const projects = new SqliteLocalProjectRepository(studioDatabase.connection);
  const cloudCache = new SqliteCloudProjectCache(studioDatabase.connection);
  const runs = new RuntimeRunCoordinator({
    accountScope: () => requireRuntimeAccountScope(auth),
    projects,
    runtime,
  });
  runtimeRuns = runs;
  registerRuntimeHandlers(runtime, {
    runs,
    persistCompilation: async (request, result) => {
      const restored = await auth.restore();
      if (restored.status !== 'authenticated') {
        throw new RuntimeError(
          'RUNTIME_INVALID_REQUEST',
          'Sign in to persist the compiled project cache.',
          false,
        );
      }
      await projects.saveRuntimeCompilation({
        accountScope: accountScopeFromName(restored.account),
        expectedSourceRevision: request.sourceRevision,
        localId: request.projectId,
        runtimeIr: result.runtimeIr,
        validationSummary: result.validation,
        workflowPath: request.workflowPath,
      });
    },
  });
  registerProjectHandlers({ auth, projects });
  registerCloudProjectHandlers(createProjectCloudService({ auth, cache: cloudCache, projects }));
  void manager.ensureReady().catch((error) => {
    logMain('error', 'runtime_startup_failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
  });
  createWindow();
  logMain('info', 'app_ready', { packaged: app.isPackaged });

  app.on('activate', () => {
    if (!quitInProgress && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  requestApplicationQuit(BrowserWindow.getFocusedWindow() ?? undefined);
});

app.on('will-quit', () => {
  studioDatabase?.close();
  studioDatabase = null;
});

process.on('uncaughtException', (error) => {
  logMain('error', 'uncaught_exception', { name: error.name });
});

process.on('unhandledRejection', (reason) => {
  logMain('error', 'unhandled_rejection', { reasonType: typeof reason });
});
