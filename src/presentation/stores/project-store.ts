import { createStore } from 'zustand/vanilla';

import {
  AutosaveCoordinator,
  type AutosaveCoordinatorOptions,
} from '@application/project/autosave-coordinator';
import {
  completeProjectSave,
  createProjectSession,
  isProjectDirty,
  replaceProjectDocument,
  updateProjectDocument,
  type ProjectSession,
} from '@application/project/project-session';
import type {
  CreateProjectInput,
  ProjectRepository,
  ProjectSnapshot,
} from '@application/project/project-repository';
import type {
  CloudProject,
  CloudProjectIndex,
  ProjectCloudClient,
  UpdateCloudProjectInput,
} from '@application/project/project-cloud';
import {
  createProject,
  exportProject,
  importProject,
  listProjects,
  openProject,
  saveProject,
} from '@application/project/project-use-cases';
import { editProjectWorkflow } from '@application/workflow/edit-workflow';
import type { ProjectDocument } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';

export type ProjectOperationStatus =
  'creating' | 'exporting' | 'idle' | 'importing' | 'loading' | 'opening' | 'ready';

export type LocalSaveStatus = 'dirty' | 'local-save-error' | 'saved-local' | 'saving-local';

interface ProjectHistoryEntry {
  document: ProjectDocument;
  revision: number;
}

export interface ProjectStoreState {
  cloudAvailable: boolean;
  cloudIndex: CloudProjectIndex;
  cloudStatus: 'idle' | 'loading' | 'mutating' | 'refreshing' | 'syncing';
  cloudError: string | null;
  session: ProjectSession | null;
  recentProjects: ProjectSnapshot[];
  status: ProjectOperationStatus;
  error: string | null;
  localSaveError: string | null;
  localSaveStatus: LocalSaveStatus;
  undoStack: ProjectHistoryEntry[];
  redoStack: ProjectHistoryEntry[];
  nextRevision: number;
  create(input: CreateProjectInput): Promise<ProjectSnapshot | null>;
  exportProject(): Promise<void>;
  importProject(): Promise<ProjectSnapshot | null>;
  loadRecent(): Promise<void>;
  open(localId: string): Promise<ProjectSnapshot | null>;
  openCloudProject(projectId: string): Promise<ProjectSnapshot | null>;
  flushLocalSave(): Promise<boolean>;
  refreshCloudProjects(): Promise<boolean>;
  archiveCloudProject(projectId: string): Promise<CloudProject | null>;
  getCloudProject(projectId: string): Promise<CloudProject | null>;
  syncCloud(): Promise<boolean>;
  updateFromCloud(): Promise<boolean>;
  updateCloudProject(
    projectId: string,
    input: UpdateCloudProjectInput,
    localId?: string,
  ): Promise<CloudProject | null>;
  updateProjectName(name: string): void;
  executeWorkflowCommand(
    workflowPath: string,
    command: WorkflowCommand,
    catalog: readonly NodeDefinition[],
  ): boolean;
  undo(): void;
  redo(): void;
  clearCommandError(): void;
  close(): Promise<boolean>;
  discard(): void;
  clearError(): void;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Project operation failed';
}

function addRecent(items: ProjectSnapshot[], snapshot: ProjectSnapshot) {
  return [snapshot, ...items.filter((item) => item.localId !== snapshot.localId)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

function replaceCloudProject(index: CloudProjectIndex, project: CloudProject): CloudProjectIndex {
  return {
    ...index,
    projects: [project, ...index.projects.filter((item) => item.id !== project.id)],
  };
}

function syncNotice(snapshot: ProjectSnapshot) {
  if (snapshot.draftState.syncStatus === 'conflict') {
    return 'Local and cloud drafts both changed. The local draft was kept; nothing was uploaded.';
  }
  if (snapshot.draftState.syncStatus === 'remote-ahead') {
    return 'Cloud has a newer draft. The local draft was kept; nothing was downloaded.';
  }
  return null;
}

function emptyHistory(session: ProjectSession | null) {
  return {
    undoStack: [] as ProjectHistoryEntry[],
    redoStack: [] as ProjectHistoryEntry[],
    nextRevision: (session?.workingRevision ?? 0) + 1,
  };
}

function commitDocument(state: ProjectStoreState, document: ProjectDocument) {
  if (!state.session) return {};
  const revision = state.nextRevision;
  return {
    session: replaceProjectDocument(state.session, document, revision),
    undoStack: [
      ...state.undoStack,
      {
        document: state.session.snapshot.document,
        revision: state.session.workingRevision,
      },
    ].slice(-100),
    redoStack: [],
    nextRevision: revision + 1,
  };
}

export function createProjectStore(
  repository: ProjectRepository,
  options: { autosave?: AutosaveCoordinatorOptions; cloud?: ProjectCloudClient } = {},
) {
  return createStore<ProjectStoreState>((set, get) => {
    const persistLocal = async () => {
      const startingSession = get().session;
      if (!startingSession || !isProjectDirty(startingSession)) return;
      const savedRevision = startingSession.workingRevision;
      const snapshot = structuredClone(startingSession.snapshot);
      set({ localSaveError: null, localSaveStatus: 'saving-local' });
      try {
        const persistedSnapshot = await saveProject(repository, snapshot);
        set((state) => {
          if (!state.session || state.session.snapshot.localId !== snapshot.localId) return state;
          const session = completeProjectSave(state.session, savedRevision, persistedSnapshot);
          return {
            session,
            recentProjects: addRecent(state.recentProjects, session.snapshot),
            error: null,
            localSaveError: null,
            localSaveStatus: isProjectDirty(session) ? 'dirty' : 'saved-local',
          };
        });
      } catch (error) {
        const message = messageOf(error);
        set({ error: message, localSaveError: message, localSaveStatus: 'local-save-error' });
        throw error;
      }
    };
    const autosave = new AutosaveCoordinator(persistLocal, options.autosave);
    const flushLocalSave = async () => {
      if (get().session && projectStoreIsDirty(get()) && !autosave.hasPendingWork()) {
        autosave.schedule();
      }
      try {
        await autosave.flush();
        return !projectStoreIsDirty(get());
      } catch {
        return false;
      }
    };
    const prepareForProjectChange = async () => {
      if (!(await flushLocalSave())) return false;
      autosave.cancel();
      return true;
    };
    const activateSnapshot = (snapshot: ProjectSnapshot) => {
      const session = createProjectSession(snapshot);
      set((state) => ({
        ...emptyHistory(session),
        session,
        recentProjects: addRecent(state.recentProjects, snapshot),
        status: 'ready',
        error: null,
        localSaveError: null,
        localSaveStatus: 'saved-local',
      }));
    };

    return {
      cloudAvailable: Boolean(options.cloud),
      cloudIndex: { projects: [], refreshedAt: null, source: 'cache', warning: null },
      cloudStatus: 'idle',
      cloudError: null,
      session: null,
      recentProjects: [],
      status: 'idle',
      error: null,
      localSaveError: null,
      localSaveStatus: 'saved-local',
      ...emptyHistory(null),
      async loadRecent() {
        set({ status: 'loading', error: null });
        try {
          set({ recentProjects: await listProjects(repository), status: 'idle' });
          if (!options.cloud) return;
          set({ cloudStatus: 'loading', cloudError: null });
          const cached = await options.cloud.load();
          set({ cloudIndex: cached, cloudStatus: 'refreshing' });
          const refreshed = await options.cloud.refresh();
          set({
            cloudIndex: refreshed,
            cloudError: refreshed.warning,
            cloudStatus: 'idle',
          });
        } catch (error) {
          const message = messageOf(error);
          set((state) => ({
            status: 'idle',
            cloudStatus: 'idle',
            ...(state.recentProjects.length > 0 ? { cloudError: message } : { error: message }),
          }));
        }
      },
      async create(input) {
        if (!(await prepareForProjectChange())) return null;
        set({ status: 'creating', error: null });
        try {
          const snapshot = await createProject(repository, input);
          activateSnapshot(snapshot);
          return snapshot;
        } catch (error) {
          set({ status: 'idle', error: messageOf(error) });
          return null;
        }
      },
      async open(localId) {
        if (!(await prepareForProjectChange())) return null;
        set({ status: 'opening', error: null });
        try {
          const snapshot = await openProject(repository, localId);
          activateSnapshot(snapshot);
          return snapshot;
        } catch (error) {
          set({ status: 'idle', error: messageOf(error) });
          return null;
        }
      },
      async openCloudProject(projectId) {
        if (!options.cloud || !(await prepareForProjectChange())) return null;
        set({ status: 'opening', cloudStatus: 'loading', cloudError: null, error: null });
        try {
          const snapshot = await options.cloud.open(projectId);
          activateSnapshot(snapshot);
          set({ cloudStatus: 'idle' });
          return snapshot;
        } catch (error) {
          set({ status: 'idle', cloudStatus: 'idle', cloudError: messageOf(error) });
          return null;
        }
      },
      async importProject() {
        if (!(await prepareForProjectChange())) return null;
        set({ status: 'importing', error: null });
        try {
          const snapshot = await importProject(repository);
          if (!snapshot) {
            set({ status: 'idle' });
            return null;
          }
          activateSnapshot(snapshot);
          return snapshot;
        } catch (error) {
          set({ status: 'idle', error: messageOf(error) });
          return null;
        }
      },
      flushLocalSave,
      async refreshCloudProjects() {
        if (!options.cloud) return false;
        set({ cloudStatus: 'refreshing', cloudError: null });
        try {
          const refreshed = await options.cloud.refresh();
          set({
            cloudIndex: refreshed,
            cloudError: refreshed.warning,
            cloudStatus: 'idle',
          });
          return true;
        } catch (error) {
          set({ cloudStatus: 'idle', cloudError: messageOf(error) });
          return false;
        }
      },
      async syncCloud() {
        if (!options.cloud || !(await flushLocalSave())) return false;
        const startingSession = get().session;
        if (!startingSession) return false;
        set({ cloudStatus: 'syncing', cloudError: null, error: null });
        try {
          const synced = await options.cloud.sync(startingSession.snapshot.localId);
          set((state) => {
            if (!state.session || state.session.snapshot.localId !== synced.localId) {
              return {
                recentProjects: addRecent(state.recentProjects, synced),
                cloudStatus: 'idle',
                cloudError: syncNotice(synced),
              };
            }
            const session = {
              ...state.session,
              snapshot: { ...synced, document: state.session.snapshot.document },
            };
            return {
              session,
              recentProjects: addRecent(state.recentProjects, session.snapshot),
              cloudStatus: 'idle',
              cloudError: syncNotice(synced),
            };
          });
          return true;
        } catch (error) {
          const message = messageOf(error);
          set({ cloudStatus: 'idle', cloudError: message });
          try {
            const persisted = await openProject(repository, startingSession.snapshot.localId);
            set((state) => ({
              recentProjects: addRecent(state.recentProjects, persisted),
              session:
                state.session?.snapshot.localId === persisted.localId
                  ? {
                      ...state.session,
                      snapshot: { ...persisted, document: state.session.snapshot.document },
                    }
                  : state.session,
            }));
          } catch {
            // Preserve the original cloud failure and the current editor working copy.
          }
          return false;
        }
      },
      async updateFromCloud() {
        if (!options.cloud || !(await flushLocalSave())) return false;
        const localId = get().session?.snapshot.localId;
        if (!localId) return false;
        set({ cloudStatus: 'syncing', cloudError: null, error: null });
        try {
          const snapshot = await options.cloud.updateFromCloud(localId);
          const session = createProjectSession(snapshot);
          set((state) => ({
            ...emptyHistory(session),
            session,
            recentProjects: addRecent(state.recentProjects, snapshot),
            cloudStatus: 'idle',
            localSaveError: null,
            localSaveStatus: 'saved-local',
          }));
          return true;
        } catch (error) {
          set({ cloudStatus: 'idle', cloudError: messageOf(error) });
          return false;
        }
      },
      async getCloudProject(projectId) {
        if (!options.cloud) return null;
        set({ cloudStatus: 'loading', cloudError: null });
        try {
          const project = await options.cloud.getDetail(projectId);
          set((state) => ({
            cloudIndex: replaceCloudProject(state.cloudIndex, project),
            cloudStatus: 'idle',
          }));
          return project;
        } catch (error) {
          set({ cloudStatus: 'idle', cloudError: messageOf(error) });
          return null;
        }
      },
      async updateCloudProject(projectId, input, localId) {
        if (!options.cloud || !(await flushLocalSave())) return null;
        set({ cloudStatus: 'mutating', cloudError: null });
        try {
          if (localId) {
            const current = await openProject(repository, localId);
            const description =
              input.description === undefined
                ? current.document.manifest.description
                : input.description?.trim() || undefined;
            const document = {
              ...current.document,
              manifest: {
                ...current.document.manifest,
                name: input.name?.trim() ?? current.document.manifest.name,
                ...(description ? { description } : {}),
              },
            };
            if (!description) delete document.manifest.description;
            await saveProject(repository, { ...current, document });
            if (current.draftState.baseRemoteName === null) {
              await options.cloud.update(projectId, input, localId);
            }
            const synced = await options.cloud.sync(localId);
            set((state) => {
              const session =
                state.session?.snapshot.localId === localId
                  ? createProjectSession(synced)
                  : state.session;
              return {
                ...(session !== state.session ? emptyHistory(session) : {}),
                recentProjects: addRecent(state.recentProjects, synced),
                session,
              };
            });
            if (synced.draftState.syncStatus === 'conflict') {
              throw new Error('Cloud project changed elsewhere. Local metadata was kept safely.');
            }
            if (synced.draftState.syncStatus === 'remote-ahead') {
              throw new Error('Cloud project is ahead. Local metadata was kept safely.');
            }
          } else {
            const project = await options.cloud.update(projectId, input);
            set((state) => ({ cloudIndex: replaceCloudProject(state.cloudIndex, project) }));
          }
          const project = await options.cloud.getDetail(projectId);
          set((state) => ({
            cloudIndex: replaceCloudProject(state.cloudIndex, project),
            cloudStatus: 'idle',
          }));
          return project;
        } catch (error) {
          set({ cloudStatus: 'idle', cloudError: messageOf(error) });
          return null;
        }
      },
      async archiveCloudProject(projectId) {
        if (!options.cloud || !(await flushLocalSave())) return null;
        set({ cloudStatus: 'mutating', cloudError: null });
        try {
          const project = await options.cloud.archive(projectId);
          set((state) => ({
            cloudIndex: replaceCloudProject(state.cloudIndex, project),
            cloudStatus: 'idle',
          }));
          return project;
        } catch (error) {
          set({ cloudStatus: 'idle', cloudError: messageOf(error) });
          return null;
        }
      },
      async exportProject() {
        if (!(await flushLocalSave())) return;
        const startingSession = get().session;
        if (!startingSession) return;
        const snapshot = structuredClone(startingSession.snapshot);
        set({ status: 'exporting', error: null });
        try {
          await exportProject(repository, snapshot);
          set({ status: 'ready' });
        } catch (error) {
          set({ status: 'ready', error: messageOf(error) });
        }
      },
      updateProjectName(name) {
        let changed = false;
        set((state) => {
          if (!state.session || state.session.snapshot.document.manifest.name === name)
            return state;
          changed = true;
          const updated = updateProjectDocument(state.session, (document) => ({
            ...document,
            manifest: { ...document.manifest, name },
          }));
          return {
            ...commitDocument(state, updated.snapshot.document),
            error: null,
            localSaveError: null,
            localSaveStatus: 'dirty',
          };
        });
        if (changed) autosave.schedule();
      },
      executeWorkflowCommand(workflowPath, command, catalog) {
        let applied = false;
        set((state) => {
          if (!state.session) return state;
          try {
            const document = editProjectWorkflow(
              state.session.snapshot.document,
              workflowPath,
              command,
              catalog,
            );
            applied = true;
            return {
              ...commitDocument(state, document),
              error: null,
              localSaveError: null,
              localSaveStatus: 'dirty',
            };
          } catch (error) {
            return { error: messageOf(error) };
          }
        });
        if (applied) autosave.schedule();
        return applied;
      },
      undo() {
        let changed = false;
        set((state) => {
          if (!state.session || state.undoStack.length === 0) return state;
          changed = true;
          const previous = state.undoStack.at(-1)!;
          const current = {
            document: state.session.snapshot.document,
            revision: state.session.workingRevision,
          };
          return {
            session: replaceProjectDocument(state.session, previous.document, previous.revision),
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, current].slice(-100),
            error: null,
            localSaveError: null,
            localSaveStatus: 'dirty',
          };
        });
        if (changed) autosave.schedule();
      },
      redo() {
        let changed = false;
        set((state) => {
          if (!state.session || state.redoStack.length === 0) return state;
          changed = true;
          const next = state.redoStack.at(-1)!;
          const current = {
            document: state.session.snapshot.document,
            revision: state.session.workingRevision,
          };
          return {
            session: replaceProjectDocument(state.session, next.document, next.revision),
            undoStack: [...state.undoStack, current].slice(-100),
            redoStack: state.redoStack.slice(0, -1),
            error: null,
            localSaveError: null,
            localSaveStatus: 'dirty',
          };
        });
        if (changed) autosave.schedule();
      },
      clearCommandError() {
        set({ error: null });
      },
      async close() {
        if (!(await prepareForProjectChange())) return false;
        set({ session: null, status: 'idle', error: null, ...emptyHistory(null) });
        return true;
      },
      discard() {
        autosave.cancel();
        set({
          session: null,
          status: 'idle',
          error: null,
          localSaveError: null,
          localSaveStatus: 'saved-local',
          ...emptyHistory(null),
        });
      },
      clearError() {
        set({ error: null });
      },
    };
  });
}

export function projectStoreIsDirty(state: ProjectStoreState) {
  return state.session ? isProjectDirty(state.session) : false;
}
