import { accountScopeFromName } from '@application/auth/account-scope';
import type { MainAuthSession } from '@application/auth/auth-session';
import {
  CloudProjectError,
  ProjectCloudService,
  type ProjectCloudClient,
} from '@application/project/project-cloud';
import type {
  CloudProjectCacheRepository,
  LocalProjectRepository,
} from '@application/project/local-project-repository';
import { createProjectCloudApi } from '@electron/main/api/project-cloud.api';
import { logMain } from '@electron/main/logger';

export function createProjectCloudService(input: {
  auth: MainAuthSession;
  cache: CloudProjectCacheRepository;
  projects: LocalProjectRepository;
}): ProjectCloudClient {
  const accountScope = async () => {
    const session = await input.auth.restore();
    if (session.status !== 'authenticated') {
      throw new CloudProjectError(
        'CLOUD_SESSION_EXPIRED',
        'Sign in before accessing cloud projects.',
        false,
      );
    }
    return accountScopeFromName(session.account);
  };
  return new ProjectCloudService(
    createProjectCloudApi(),
    input.cache,
    input.projects,
    input.auth,
    accountScope,
    {
      onEvent: (event) =>
        logMain(event.event === 'sync_failed' ? 'error' : 'info', `project_${event.event}`, {
          ...(event.attemptId ? { attemptId: event.attemptId } : {}),
          ...(event.localId ? { localId: event.localId } : {}),
          ...(event.remoteProjectId ? { remoteProjectId: event.remoteProjectId } : {}),
          ...(event.localRevision === undefined ? {} : { localRevision: event.localRevision }),
          ...(event.remoteVersion === undefined ? {} : { remoteVersion: event.remoteVersion }),
          ...(event.status ? { status: event.status } : {}),
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
        }),
    },
  );
}
