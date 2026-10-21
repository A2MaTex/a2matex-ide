import { contextBridge, ipcRenderer } from 'electron';

import type { StudioHostApi } from '../../src/infrastructure/electron/studio-host-api.js';

const studioHost = {
  system: {
    getInfo: () => ipcRenderer.invoke('studio:system:get-info'),
  },
  auth: {
    restore: () => ipcRenderer.invoke('studio:auth:restore'),
    login: (input) => ipcRenderer.invoke('studio:auth:login', input),
    logout: () => ipcRenderer.invoke('studio:auth:logout'),
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
