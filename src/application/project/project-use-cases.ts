import {
  ProjectRepositoryError,
  type CreateProjectInput,
  type ProjectRepository,
  type ProjectSnapshot,
} from '@application/project/project-repository';

export async function createProject(repository: ProjectRepository, input: CreateProjectInput) {
  const normalizedName = input.name.trim();
  const normalizedDescription = input.description?.trim() || undefined;
  if (!normalizedName || normalizedName.length > 255) {
    throw new ProjectRepositoryError(
      'PROJECT_NAME_INVALID',
      'Project name must contain between 1 and 255 characters.',
    );
  }
  if (normalizedDescription && normalizedDescription.length > 4_000) {
    throw new ProjectRepositoryError(
      'PROJECT_DESCRIPTION_INVALID',
      'Project description must not exceed 4,000 characters.',
    );
  }
  return repository.create({ name: normalizedName, description: normalizedDescription });
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
