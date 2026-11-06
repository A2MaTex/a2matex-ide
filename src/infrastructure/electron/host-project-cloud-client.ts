import {
  CloudProjectError,
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
  load(): Promise<CloudProjectIndex> {
    if (!window.studioHost) return Promise.resolve(emptyIndex());
    return window.studioHost.cloudProject.load().then(unwrap);
  }

  refresh(): Promise<CloudProjectIndex> {
    if (!window.studioHost) return Promise.resolve(emptyIndex());
    return window.studioHost.cloudProject.refresh().then(unwrap);
  }

  syncFirst(localId: string) {
    if (!window.studioHost) {
      return Promise.reject(
        new CloudProjectError(
          'CLOUD_CONFIGURATION_ERROR',
          'Cloud sync is only available in the desktop app.',
          false,
        ),
      );
    }
    return window.studioHost.cloudProject.syncFirst(localId).then(unwrap);
  }
}

function emptyIndex(): CloudProjectIndex {
  return { projects: [], refreshedAt: null, source: 'cache', warning: null };
}

export const hostProjectCloudClient = new HostProjectCloudClient();
