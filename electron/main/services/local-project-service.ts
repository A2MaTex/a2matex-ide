import { randomUUID } from 'node:crypto';

import type { LocalProjectRepository } from '@application/project/local-project-repository';
import {
  ProjectRepositoryError,
  type CreateProjectInput,
  type ExportProjectInput,
  type SaveProjectInput,
} from '@application/project/project-repository';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import type { ArchiveLocation } from '@electron/main/security/location-registry';
import type { ProjectArchiveService } from '@electron/main/services/project-file-service';

export class LocalProjectService {
  constructor(
    private readonly projects: LocalProjectRepository,
    private readonly archives: ProjectArchiveService,
    private readonly accountScope: () => Promise<string>,
    private readonly createId: () => string = randomUUID,
  ) {}

  async list() {
    return this.projects.list(await this.accountScope());
  }

  async create(rawInput: unknown) {
    const input = isCreateProjectInput(rawInput) ? rawInput : null;
    const name = input?.name.trim() ?? '';
    const description = input?.description?.trim() || undefined;
    if (!name || name.length > 255) {
      throw new ProjectRepositoryError(
        'PROJECT_NAME_INVALID',
        'Project name must contain between 1 and 255 characters.',
      );
    }
    if (description && description.length > 4_000) {
      throw new ProjectRepositoryError(
        'PROJECT_DESCRIPTION_INVALID',
        'Project description must not exceed 4,000 characters.',
      );
    }
    const localId = this.createId();
    return this.projects.create({
      accountScope: await this.accountScope(),
      document: createEmptyProjectDocument(localId, name, description),
      localId,
    });
  }

  async open(rawLocalId: unknown) {
    const localId = typeof rawLocalId === 'string' ? rawLocalId.trim() : '';
    const snapshot = localId
      ? await this.projects.findById(await this.accountScope(), localId)
      : null;
    if (!snapshot) {
      throw new ProjectRepositoryError('PROJECT_NOT_FOUND', 'Local project was not found.');
    }
    return snapshot;
  }

  async save(input: SaveProjectInput) {
    return this.projects.save({ ...input, accountScope: await this.accountScope() });
  }

  async importProject(source: ArchiveLocation) {
    const imported = await this.archives.importProject(source);
    return this.projects.create({
      accountScope: await this.accountScope(),
      document: imported.document,
      localId: this.createId(),
    });
  }

  exportProject(input: ExportProjectInput, target: ArchiveLocation) {
    return this.archives.exportProject(input.document, target);
  }
}

function isCreateProjectInput(value: unknown): value is CreateProjectInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) => key === 'name' || key === 'description') &&
    typeof Reflect.get(value, 'name') === 'string' &&
    (Reflect.get(value, 'description') === undefined ||
      typeof Reflect.get(value, 'description') === 'string')
  );
}
