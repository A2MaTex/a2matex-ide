import {
  CloudProjectError,
  type CloudProject,
  type CloudProjectErrorCode,
  type CloudProjectIndex,
  type ProjectCloudClient,
} from '@application/project/project-cloud';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function unwrap<T>(result: HostResult<T, CloudProjectErrorCode>): T {
  if (result.ok) return result.value;
  throw new CloudProjectError(result.error.code, result.error.message, result.error.retryable);
}

export class HostProjectCloudClient implements ProjectCloudClient {
  open(projectId: string) {
    if (!window.studioHost) return Promise.reject(unavailable());
    return window.studioHost.cloudProject.open(projectId).then(unwrap);
  }

  getDetail(projectId: string): Promise<CloudProject> {
    if (!window.studioHost) return Promise.reject(unavailable());
    return window.studioHost.cloudProject.getDetail(projectId).then(unwrap);
  }

  update(projectId: string, input: Parameters<ProjectCloudClient['update']>[1], localId?: string) {
    if (!window.studioHost) return Promise.reject(unavailable());
    return window.studioHost.cloudProject.update(projectId, input, localId).then(unwrap);
  }

  archive(projectId: string) {
    if (!window.studioHost) return Promise.reject(unavailable());
    return window.studioHost.cloudProject.archive(projectId).then(unwrap);
  }

  load(): Promise<CloudProjectIndex> {
    if (!window.studioHost) return Promise.resolve(emptyIndex());
    return window.studioHost.cloudProject.load().then(unwrap);
  }

  refresh(): Promise<CloudProjectIndex> {
    if (!window.studioHost) return Promise.resolve(emptyIndex());
    return window.studioHost.cloudProject.refresh().then(unwrap);
  }

  sync(localId: string) {
    if (!window.studioHost) return Promise.reject(unavailable());
    return window.studioHost.cloudProject.sync(localId).then(unwrap);
  }

  updateFromCloud(localId: string) {
    if (!window.studioHost) return Promise.reject(unavailable());
    return window.studioHost.cloudProject.updateFromCloud(localId).then(unwrap);
  }
}

function emptyIndex(): CloudProjectIndex {
  return { projects: [], refreshedAt: null, source: 'cache', warning: null };
}

export const hostProjectCloudClient = new HostProjectCloudClient();

function unavailable() {
  return new CloudProjectError(
    'CLOUD_CONFIGURATION_ERROR',
    'Cloud projects are only available in the desktop app.',
    false,
  );
}
