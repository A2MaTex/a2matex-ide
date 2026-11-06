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
import type { ProjectRepository, ProjectSnapshot } from '@application/project/project-repository';
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
  session: ProjectSession | null;
  recentProjects: ProjectSnapshot[];
  status: ProjectOperationStatus;
  error: string | null;
  localSaveError: string | null;
  localSaveStatus: LocalSaveStatus;
  undoStack: ProjectHistoryEntry[];
  redoStack: ProjectHistoryEntry[];
  nextRevision: number;
  create(name: string): Promise<ProjectSnapshot | null>;
  exportProject(): Promise<void>;
  importProject(): Promise<ProjectSnapshot | null>;
  loadRecent(): Promise<void>;
  open(localId: string): Promise<ProjectSnapshot | null>;
  flushLocalSave(): Promise<boolean>;
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
  options: { autosave?: AutosaveCoordinatorOptions } = {},
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
        } catch (error) {
          set({ status: 'idle', error: messageOf(error) });
        }
      },
      async create(name) {
        if (!(await prepareForProjectChange())) return null;
        set({ status: 'creating', error: null });
        try {
          const snapshot = await createProject(repository, name);
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
