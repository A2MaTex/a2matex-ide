import {
  ProjectRepositoryError,
  type ProjectRepository,
  type ProjectSnapshot,
} from '@application/project/project-repository';

export async function createProject(repository: ProjectRepository, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new ProjectRepositoryError(
      'PROJECT_NAME_INVALID',
      'Project name must contain between 1 and 100 characters.',
    );
  }
  return repository.create(normalizedName);
}

export function listProjects(repository: ProjectRepository) {
  return repository.list();
}

export function openProject(repository: ProjectRepository, localId: string) {
  if (!localId.trim()) {
    throw new ProjectRepositoryError('PROJECT_NOT_FOUND', 'Local project ID is required.');
  }
  return repository.open(localId);
}

export function importProject(repository: ProjectRepository) {
  return repository.importProject();
}

export function saveProject(repository: ProjectRepository, snapshot: ProjectSnapshot) {
  return repository.save({
    document: snapshot.document,
    expectedLocalRevision: snapshot.draftState.localRevision,
    localId: snapshot.localId,
  });
}

export function exportProject(repository: ProjectRepository, snapshot: ProjectSnapshot) {
  return repository.exportProject({ document: snapshot.document });
}
