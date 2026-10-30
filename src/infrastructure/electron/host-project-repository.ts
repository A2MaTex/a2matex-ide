import {
  ProjectRepositoryError,
  type CreateProjectInput,
  type ProjectErrorCode,
  type ProjectLocation,
  type ProjectRepository,
  type ProjectSnapshot,
} from '@application/project/project-repository';
import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';

import type { HostResult } from '@infrastructure/electron/studio-host-api';

function unwrap<T>(result: HostResult<T, ProjectErrorCode>): T {
  if (result.ok) return result.value;
  throw new ProjectRepositoryError(result.error.code, result.error.message, result.error.retryable);
}

export class HostProjectRepository implements ProjectRepository {
  private readonly fallback = new InMemoryProjectRepository();

  async chooseCreateParent() {
    if (!window.studioHost) return this.fallback.chooseCreateParent();
    return unwrap(await window.studioHost.project.chooseCreateParent());
  }

  async chooseOpenLocation() {
    if (!window.studioHost) return this.fallback.chooseOpenLocation();
    return unwrap(await window.studioHost.project.chooseOpenLocation());
  }

  async chooseSaveAsLocation() {
    if (!window.studioHost) return this.fallback.chooseSaveAsLocation();
    return unwrap(await window.studioHost.project.chooseSaveAsLocation());
  }

  async create(input: CreateProjectInput) {
    if (!window.studioHost) return this.fallback.create(input);
    return unwrap(await window.studioHost.project.create(input));
  }

  async open(location: ProjectLocation) {
    if (!window.studioHost) return this.fallback.open(location);
    return unwrap(await window.studioHost.project.open(location));
  }

  async save(snapshot: ProjectSnapshot) {
    if (!window.studioHost) return this.fallback.save(snapshot);
    return unwrap(await window.studioHost.project.save(snapshot));
  }

  async saveAs(snapshot: ProjectSnapshot, target: ProjectLocation) {
    if (!window.studioHost) return this.fallback.saveAs(snapshot, target);
    return unwrap(await window.studioHost.project.saveAs({ snapshot, target }));
  }
}

export const hostProjectRepository = new HostProjectRepository();
