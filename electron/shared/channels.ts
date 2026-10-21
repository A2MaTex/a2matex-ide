export const IPC_CHANNELS = {
  systemGetInfo: 'studio:system:get-info',
  authRestore: 'studio:auth:restore',
  authLogin: 'studio:auth:login',
  authLogout: 'studio:auth:logout',
  projectChooseCreateParent: 'studio:project:choose-create-parent',
  projectChooseOpenLocation: 'studio:project:choose-open-location',
  projectChooseSaveAsLocation: 'studio:project:choose-save-as-location',
  projectCreate: 'studio:project:create',
  projectOpen: 'studio:project:open',
  projectSave: 'studio:project:save',
  projectSaveAs: 'studio:project:save-as',
} as const;
