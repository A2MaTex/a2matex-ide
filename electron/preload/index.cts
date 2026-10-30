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
  project: {
    chooseCreateParent: () => ipcRenderer.invoke('studio:project:choose-create-parent'),
    chooseOpenLocation: () => ipcRenderer.invoke('studio:project:choose-open-location'),
    chooseSaveAsLocation: () => ipcRenderer.invoke('studio:project:choose-save-as-location'),
    create: (input) => ipcRenderer.invoke('studio:project:create', input),
    open: (location) => ipcRenderer.invoke('studio:project:open', location),
    save: (snapshot) => ipcRenderer.invoke('studio:project:save', snapshot),
    saveAs: (input) => ipcRenderer.invoke('studio:project:save-as', input),
  },
} satisfies StudioHostApi;

contextBridge.exposeInMainWorld('studioHost', Object.freeze(studioHost));
