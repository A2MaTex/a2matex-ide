import { randomUUID } from 'node:crypto';

import type { LocalProjectRepository } from '@application/project/local-project-repository';
import {
  ProjectRepositoryError,
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

  async create(rawName: unknown) {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name || name.length > 100) {
      throw new ProjectRepositoryError(
        'PROJECT_NAME_INVALID',
        'Project name must contain between 1 and 100 characters.',
      );
    }
    const localId = this.createId();
    return this.projects.create({
      accountScope: await this.accountScope(),
      document: createEmptyProjectDocument(localId, name),
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
