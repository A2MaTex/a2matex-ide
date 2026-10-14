import {
  ProjectRepositoryError,
  type ProjectRepository,
  type ProjectSnapshot,
} from './project-repository';

export async function createProject(repository: ProjectRepository, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100 || /[\\/\0]/.test(normalizedName)) {
    throw new ProjectRepositoryError(
      'PROJECT_NAME_INVALID',
      'Project name must contain 1–100 characters and may not contain path separators.',
    );
  }

  const parent = await repository.chooseCreateParent();
  if (!parent) return null;
  return repository.create({ name: normalizedName, parent });
}

export async function openProject(repository: ProjectRepository) {
  const location = await repository.chooseOpenLocation();
  if (!location) return null;
  return repository.open(location);
}

export async function saveProject(repository: ProjectRepository, snapshot: ProjectSnapshot) {
  return repository.save(snapshot);
}

export async function saveProjectAs(repository: ProjectRepository, snapshot: ProjectSnapshot) {
  const target = await repository.chooseSaveAsLocation();
  if (!target) return null;
  return repository.saveAs(snapshot, target);
}
