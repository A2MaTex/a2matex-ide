import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { SessionState } from '@application/auth/auth-session';
import type { StudioHostApi } from '@infrastructure/electron/studio-host-api';

const studioHost = {
  system: {
    getInfo: () => ipcRenderer.invoke('studio:system:get-info'),
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
  cloudProject: {
    load: () => ipcRenderer.invoke('studio:cloud-project:load'),
    refresh: () => ipcRenderer.invoke('studio:cloud-project:refresh'),
    syncFirst: (localId) => ipcRenderer.invoke('studio:cloud-project:sync-first', localId),
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
