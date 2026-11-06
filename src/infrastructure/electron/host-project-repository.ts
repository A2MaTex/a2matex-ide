import {
  ProjectRepositoryError,
  type ExportProjectInput,
  type ProjectErrorCode,
  type ProjectRepository,
  type SaveProjectInput,
} from '@application/project/project-repository';
import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';

import type { HostResult } from '@infrastructure/electron/studio-host-api';

function unwrap<T>(result: HostResult<T, ProjectErrorCode>): T {
  if (result.ok) return result.value;
  throw new ProjectRepositoryError(result.error.code, result.error.message, result.error.retryable);
}

export class HostProjectRepository implements ProjectRepository {
  private readonly fallback = new InMemoryProjectRepository();

  async list() {
    if (!window.studioHost) return this.fallback.list();
    return unwrap(await window.studioHost.project.list());
  }

  async create(name: string) {
    if (!window.studioHost) return this.fallback.create(name);
    return unwrap(await window.studioHost.project.create(name));
  }

  async open(localId: string) {
    if (!window.studioHost) return this.fallback.open(localId);
    return unwrap(await window.studioHost.project.open(localId));
  }

  async save(input: SaveProjectInput) {
    if (!window.studioHost) return this.fallback.save(input);
    return unwrap(await window.studioHost.project.save(input));
  }

  async importProject() {
    if (!window.studioHost) return this.fallback.importProject();
    return unwrap(await window.studioHost.project.importProject());
  }

  async exportProject(input: ExportProjectInput) {
    if (!window.studioHost) return this.fallback.exportProject(input);
    return unwrap(await window.studioHost.project.exportProject(input));
  }
}

export const hostProjectRepository = new HostProjectRepository();
