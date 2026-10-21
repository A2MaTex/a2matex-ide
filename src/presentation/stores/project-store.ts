import { createStore } from 'zustand/vanilla';

import {
  completeProjectSave,
  createProjectSession,
  isProjectDirty,
  replaceProjectDocument,
  updateProjectDocument,
  type ProjectSession,
} from '@application/project/project-session';
import type {
  ProjectLocation,
  ProjectRepository,
  ProjectSnapshot,
} from '@application/project/project-repository';
import {
  createProject,
  openProject,
  saveProject,
  saveProjectAs,
} from '@application/project/project-use-cases';
import { editProjectWorkflow } from '@application/workflow/edit-workflow';
import type { ProjectDocument } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';

export type ProjectOperationStatus = 'creating' | 'idle' | 'opening' | 'ready' | 'saving';

interface ProjectHistoryEntry {
  document: ProjectDocument;
  revision: number;
}

export interface ProjectStoreState {
  session: ProjectSession | null;
  recentProjects: ProjectSnapshot[];
  status: ProjectOperationStatus;
  error: string | null;
  undoStack: ProjectHistoryEntry[];
  redoStack: ProjectHistoryEntry[];
  nextRevision: number;
  create(name: string): Promise<ProjectSnapshot | null>;
  open(): Promise<ProjectSnapshot | null>;
  reopen(location: ProjectLocation): Promise<ProjectSnapshot | null>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  updateProjectName(name: string): void;
  executeWorkflowCommand(
    workflowPath: string,
    command: WorkflowCommand,
    catalog: readonly NodeDefinition[],
  ): boolean;
  undo(): void;
  redo(): void;
  clearCommandError(): void;
  close(): void;
  clearError(): void;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Project operation failed';
}

function addRecent(items: ProjectSnapshot[], snapshot: ProjectSnapshot) {
  return [snapshot, ...items.filter((item) => item.location.id !== snapshot.location.id)].slice(
    0,
    8,
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

export function createProjectStore(repository: ProjectRepository) {
  return createStore<ProjectStoreState>((set, get) => ({
    session: null,
    recentProjects: [],
    status: 'idle',
    error: null,
    ...emptyHistory(null),
    async create(name) {
      set({ status: 'creating', error: null });
      try {
        const snapshot = await createProject(repository, name);
        if (!snapshot) {
          set({ status: 'idle' });
          return null;
        }
        set((state) => ({
          ...emptyHistory(createProjectSession(snapshot)),
          session: createProjectSession(snapshot),
          recentProjects: addRecent(state.recentProjects, snapshot),
          status: 'ready',
          error: null,
        }));
        return snapshot;
      } catch (error) {
        set({ status: 'idle', error: messageOf(error) });
        return null;
      }
    },
    async open() {
      set({ status: 'opening', error: null });
      try {
        const snapshot = await openProject(repository);
        if (!snapshot) {
          set({ status: 'idle' });
          return null;
        }
        set((state) => ({
          ...emptyHistory(createProjectSession(snapshot)),
          session: createProjectSession(snapshot),
          recentProjects: addRecent(state.recentProjects, snapshot),
          status: 'ready',
          error: null,
        }));
        return snapshot;
      } catch (error) {
        set({ status: 'idle', error: messageOf(error) });
        return null;
      }
    },
    async reopen(location) {
      set({ status: 'opening', error: null });
      try {
        const snapshot = await repository.open(location);
        set((state) => ({
          ...emptyHistory(createProjectSession(snapshot)),
          session: createProjectSession(snapshot),
          recentProjects: addRecent(state.recentProjects, snapshot),
          status: 'ready',
          error: null,
        }));
        return snapshot;
      } catch (error) {
        set({ status: 'idle', error: messageOf(error) });
        return null;
      }
    },
    async save() {
      const startingSession = get().session;
      if (!startingSession) return;
      const savedRevision = startingSession.workingRevision;
      const snapshot = structuredClone(startingSession.snapshot);
      set({ status: 'saving', error: null });
      try {
        const result = await saveProject(repository, snapshot);
        set((state) => {
          if (!state.session) return { status: 'idle' };
          const session = completeProjectSave(state.session, savedRevision, result.location);
          return {
            session,
            recentProjects: addRecent(state.recentProjects, session.snapshot),
            status: 'ready',
          };
        });
      } catch (error) {
        set({ status: 'ready', error: messageOf(error) });
      }
    },
    async saveAs() {
      const startingSession = get().session;
      if (!startingSession) return;
      const savedRevision = startingSession.workingRevision;
      const snapshot = structuredClone(startingSession.snapshot);
      set({ status: 'saving', error: null });
      try {
        const result = await saveProjectAs(repository, snapshot);
        if (!result) {
          set({ status: 'ready' });
          return;
        }
        set((state) => {
          if (!state.session) return { status: 'idle' };
          const session = completeProjectSave(state.session, savedRevision, result.location);
          return {
            session,
            recentProjects: addRecent(state.recentProjects, session.snapshot),
            status: 'ready',
          };
        });
      } catch (error) {
        set({ status: 'ready', error: messageOf(error) });
      }
    },
    updateProjectName(name) {
      set((state) => {
        if (!state.session || state.session.snapshot.document.manifest.name === name) return state;
        const updated = updateProjectDocument(state.session, (document) => ({
          ...document,
          manifest: { ...document.manifest, name },
        }));
        return {
          ...commitDocument(state, updated.snapshot.document),
          error: null,
        };
      });
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
          return { ...commitDocument(state, document), error: null };
        } catch (error) {
          return { error: messageOf(error) };
        }
      });
      return applied;
    },
    undo() {
      set((state) => {
        if (!state.session || state.undoStack.length === 0) return state;
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
        };
      });
    },
    redo() {
      set((state) => {
        if (!state.session || state.redoStack.length === 0) return state;
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
        };
      });
    },
    clearCommandError() {
      set({ error: null });
    },
    close() {
      set({ session: null, status: 'idle', error: null, ...emptyHistory(null) });
    },
    clearError() {
      set({ error: null });
    },
  }));
}

export function projectStoreIsDirty(state: ProjectStoreState) {
  return state.session ? isProjectDirty(state.session) : false;
}
