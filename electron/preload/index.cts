import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { SessionState } from '@application/auth/auth-session';
import type { RuntimeRunPreparationEvent, RuntimeStatus } from '@application/runtime/runtime.types';
import type { StudioHostApi } from '@infrastructure/electron/studio-host-api';

const studioHost = {
  system: {
    getInfo: () => ipcRenderer.invoke('studio:system:get-info'),
    openExternal: (url) => ipcRenderer.invoke('studio:system:open-external', url),
    writeClipboardText: (text) => ipcRenderer.invoke('studio:system:write-clipboard-text', text),
    quit: () => ipcRenderer.invoke('studio:system:quit'),
  },
  onboarding: {
    getState: () => ipcRenderer.invoke('studio:onboarding:get-state'),
    getPolicies: () => ipcRenderer.invoke('studio:onboarding:get-policies'),
    chooseWorkspace: () => ipcRenderer.invoke('studio:onboarding:choose-workspace'),
    complete: (input) => ipcRenderer.invoke('studio:onboarding:complete', input),
  },
  androidInspector: {
    listDevices: () => ipcRenderer.invoke('studio:android-inspector:list-devices'),
    capture: (input) => ipcRenderer.invoke('studio:android-inspector:capture', input),
  },
  auth: {
    restore: () => ipcRenderer.invoke('studio:auth:restore'),
    login: (input) => ipcRenderer.invoke('studio:auth:login', input),
    logout: () => ipcRenderer.invoke('studio:auth:logout'),
    onSessionChanged: (listener: (session: SessionState) => void) => {
      const channel = 'studio:auth:session-changed';
      const handler = (_event: IpcRendererEvent, session: SessionState) => listener(session);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },
  catalog: {
    load: (runtimeVersion) => ipcRenderer.invoke('studio:catalog:load', runtimeVersion),
    refresh: (runtimeVersion) => ipcRenderer.invoke('studio:catalog:refresh', runtimeVersion),
  },
  runtime: {
    getStatus: () => ipcRenderer.invoke('studio:runtime:get-status'),
    validate: (input) => ipcRenderer.invoke('studio:runtime:validate', input),
    compile: (input) => ipcRenderer.invoke('studio:runtime:compile', input),
    startRun: (input) => ipcRenderer.invoke('studio:runtime:start-run', input),
    getActiveRun: () => ipcRenderer.invoke('studio:runtime:get-active-run'),
    getRun: (runGroupId) => ipcRenderer.invoke('studio:runtime:get-run', runGroupId),
    getNodeAttempts: (input) => ipcRenderer.invoke('studio:runtime:get-node-attempts', input),
    listDevices: () => ipcRenderer.invoke('studio:runtime:list-devices'),
    refreshDevices: () => ipcRenderer.invoke('studio:runtime:refresh-devices'),
    shutdown: () => ipcRenderer.invoke('studio:runtime:shutdown'),
    onStatusChanged: (listener: (status: RuntimeStatus) => void) => {
      const channel = 'studio:runtime:status-changed';
      const handler = (_event: IpcRendererEvent, status: RuntimeStatus) => listener(status);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onRunPreparationChanged: (listener: (event: RuntimeRunPreparationEvent) => void) => {
      const channel = 'studio:runtime:run-preparation-changed';
      const handler = (_event: IpcRendererEvent, runEvent: RuntimeRunPreparationEvent) =>
        listener(runEvent);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },
  cloudProject: {
    load: () => ipcRenderer.invoke('studio:cloud-project:load'),
    open: (projectId) => ipcRenderer.invoke('studio:cloud-project:open', projectId),
    refresh: () => ipcRenderer.invoke('studio:cloud-project:refresh'),
    getDetail: (projectId) => ipcRenderer.invoke('studio:cloud-project:detail', projectId),
    update: (projectId, update, localId) =>
      ipcRenderer.invoke('studio:cloud-project:update', { projectId, update, localId }),
    archive: (projectId) => ipcRenderer.invoke('studio:cloud-project:archive', projectId),
    sync: (localId) => ipcRenderer.invoke('studio:cloud-project:sync', localId),
    updateFromCloud: (localId) =>
      ipcRenderer.invoke('studio:cloud-project:update-from-cloud', localId),
  },
  project: {
    list: () => ipcRenderer.invoke('studio:project:list'),
    create: (input) => ipcRenderer.invoke('studio:project:create', input),
    open: (localId) => ipcRenderer.invoke('studio:project:open', localId),
    save: (input) => ipcRenderer.invoke('studio:project:save', input),
    importProject: () => ipcRenderer.invoke('studio:project:import'),
    exportProject: (input) => ipcRenderer.invoke('studio:project:export', input),
  },
} satisfies StudioHostApi;

contextBridge.exposeInMainWorld('studioHost', Object.freeze(studioHost));
