import type { ProjectDocument } from '@domain/project/project';

import type { ProjectLocation, ProjectSnapshot } from '@application/project/project-repository';

export interface ProjectSession {
  snapshot: ProjectSnapshot;
  workingRevision: number;
  savedRevision: number;
}

export function createProjectSession(snapshot: ProjectSnapshot): ProjectSession {
  return {
    snapshot,
    workingRevision: snapshot.migration ? 1 : 0,
    savedRevision: 0,
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

export function completeProjectSave(
  session: ProjectSession,
  savedRevision: number,
  location: ProjectLocation,
): ProjectSession {
  return {
    ...session,
    snapshot: {
      ...session.snapshot,
      location,
      migration: undefined,
    },
    savedRevision,
  };
}
