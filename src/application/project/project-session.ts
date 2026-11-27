import type { ProjectDocument } from '@domain/project/project';
import type { JsonValue } from '@shared/types/json-value';

import type { ProjectSnapshot } from '@application/project/project-repository';

export interface ProjectSession {
  snapshot: ProjectSnapshot;
  workingRevision: number;
  savedRevision: number;
}

export function createProjectSession(snapshot: ProjectSnapshot): ProjectSession {
  return {
    snapshot,
    workingRevision: snapshot.draftState.localRevision,
    savedRevision: snapshot.draftState.localRevision,
  };
}

export function isProjectDirty(session: ProjectSession) {
  return session.workingRevision !== session.savedRevision;
}

export function updateProjectDocument(
  session: ProjectSession,
  update: (document: ProjectDocument) => ProjectDocument,
): ProjectSession {
  return {
    ...session,
    snapshot: {
      ...session.snapshot,
      document: update(session.snapshot.document),
    },
    workingRevision: session.workingRevision + 1,
  };
}

export function replaceProjectDocument(
  session: ProjectSession,
  document: ProjectDocument,
  workingRevision: number,
): ProjectSession {
  return {
    ...session,
    snapshot: {
      ...session.snapshot,
      document,
    },
    workingRevision,
  };
}

/** Replaces the document and the workflow input schema together (input edits, undo / redo). */
export function replaceProjectState(
  session: ProjectSession,
  document: ProjectDocument,
  inputSchema: JsonValue,
  workingRevision: number,
): ProjectSession {
  return {
    ...session,
    snapshot: {
      ...session.snapshot,
      document,
      draftState: { ...session.snapshot.draftState, inputSchema },
    },
    workingRevision,
  };
}

export function completeProjectSave(
  session: ProjectSession,
  savedRevision: number,
  persistedSnapshot: ProjectSnapshot,
): ProjectSession {
  return {
    ...session,
    snapshot: {
      ...persistedSnapshot,
      document: session.snapshot.document,
      // Edits made while the save was in flight stay in the working copy.
      draftState: {
        ...persistedSnapshot.draftState,
        inputSchema: session.snapshot.draftState.inputSchema,
      },
    },
    savedRevision,
  };
}
