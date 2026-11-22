import path from 'node:path';

import { app, BrowserWindow, dialog, session } from 'electron';

import { createAuthSessionService } from '@electron/main/auth/create-auth-session-service';
import { accountScopeFromName } from '@application/auth/account-scope';
import type { MainAuthSession } from '@application/auth/auth-session';
import { RuntimeError } from '@application/runtime/runtime.error';
import { getCurrentPolicies } from '@electron/main/api/policy.api';
import { NodeAdbProcessRunner, ProcessAdbClient } from '@electron/main/adapters/android/adb-client';
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
import { resolveRuntimeResources } from '@electron/main/runtime/process/runtime-executable';
import { RuntimeProcessManager } from '@electron/main/runtime/process/runtime-process-manager';
import {
  RuntimeRunCoordinator,
  RuntimeRunCoordinatorError,
} from '@electron/main/runtime/run/runtime-run-coordinator';

const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
let studioDatabase: StudioDatabase | null = null;
let runtimeManager: RuntimeProcessManager | null = null;
let runtimeRuns: RuntimeRunCoordinator | null = null;
let quitInProgress = false;
let shutdownComplete = false;

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
  let resolvedRuntimeResources: ReturnType<typeof resolveRuntimeResources> | null = null;
  const runtimeResources = () => {
    resolvedRuntimeResources ??= resolveRuntimeResources({
      appPath,
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    });
    return resolvedRuntimeResources;
  };
  registerAndroidInspectorHandlers(
    new DefaultAndroidInspectorService(
      new ProcessAdbClient(new NodeAdbProcessRunner(() => runtimeResources().adbExecutable)),
    ),
  );
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
  runtimeManager = new RuntimeProcessManager({
    resolveAdbExecutable: () => runtimeResources().adbExecutable,
    resolveExecutable: () => runtimeResources().runtimeExecutable,
  });
  const runtime = createRuntimeServices(runtimeManager);
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
  createWindow();
  logMain('info', 'app_ready', { packaged: app.isPackaged });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (quitInProgress) return;
  if (runtimeRuns?.hasUnresolvedRun()) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Stay open', 'Stop and exit'],
      defaultId: 0,
      cancelId: 0,
      title: 'A Test Run is still active',
      message: 'Stop the active Test Run and exit A2MaTeX Studio?',
      detail: 'Staying open keeps the managed Runtime and execution running.',
    });
    if (choice === 0) return;
  }
  quitInProgress = true;
  void (async () => {
    try {
      await runtimeManager?.shutdown();
    } catch (error) {
      logMain('error', 'runtime_shutdown_failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      studioDatabase?.close();
      studioDatabase = null;
      runtimeManager = null;
      runtimeRuns = null;
      shutdownComplete = true;
      app.quit();
    }
  })();
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
