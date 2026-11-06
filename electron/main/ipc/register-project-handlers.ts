import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { accountScopeFromName } from '@application/auth/account-scope';
import type { MainAuthSession } from '@application/auth/auth-session';
import {
  LocalProjectPersistenceError,
  type LocalProjectRepository,
} from '@application/project/local-project-repository';
import {
  ProjectRepositoryError,
  type ExportProjectInput,
  type ProjectErrorCode,
  type SaveProjectInput,
} from '@application/project/project-repository';
import { IPC_CHANNELS } from '@electron/shared/channels';
import { LocationRegistry, type LocationKind } from '@electron/main/security/location-registry';
import {
  mapProjectFileError,
  ProjectArchiveService,
} from '@electron/main/services/project-file-service';
import { LocalProjectService } from '@electron/main/services/local-project-service';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function success<T>(value: T): HostResult<T> {
  return { ok: true, value };
}

function failure(error: unknown): HostResult<never> {
  let mapped: { code: ProjectErrorCode; message: string; retryable: boolean };
  if (error instanceof LocalProjectPersistenceError || error instanceof ProjectRepositoryError) {
    mapped = error;
  } else {
    const fileError = mapProjectFileError(error);
    mapped = fileError;
  }
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

async function chooseDirectory(
  locations: LocationRegistry,
  event: IpcMainInvokeEvent,
  kind: LocationKind,
  title: string,
) {
  assertTrustedSender(event);
  const e2eRoot = process.env.A2MATEX_E2E_PROJECT_ROOT;
  if (process.env.A2MATEX_E2E === '1' && e2eRoot) {
    return locations.register(e2eRoot, kind);
  }

  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title,
    properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  return locations.register(result.filePaths[0], kind);
}

function handle(channel: string, handler: (event: IpcMainInvokeEvent, input: unknown) => unknown) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, input) => {
    try {
      assertTrustedSender(event);
      return await handler(event, input);
    } catch (error) {
      return failure(error);
    }
  });
}

async function requireAccountScope(auth: MainAuthSession) {
  const session = await auth.restore();
  if (session.status !== 'authenticated') {
    throw new ProjectRepositoryError(
      'PROJECT_ACCOUNT_UNAVAILABLE',
      'Sign in before accessing local projects.',
    );
  }
  return accountScopeFromName(session.account);
}

export function registerProjectHandlers(input: {
  auth: MainAuthSession;
  projects: LocalProjectRepository;
}) {
  const locations = new LocationRegistry();
  const archives = new ProjectArchiveService(locations);
  const service = new LocalProjectService(input.projects, archives, () =>
    requireAccountScope(input.auth),
  );

  handle(IPC_CHANNELS.projectList, async () => success(await service.list()));
  handle(IPC_CHANNELS.projectCreate, async (_event, rawInput) =>
    success(await service.create(rawInput)),
  );
  handle(IPC_CHANNELS.projectOpen, async (_event, rawLocalId) =>
    success(await service.open(rawLocalId)),
  );
  handle(IPC_CHANNELS.projectSave, async (_event, rawInput) =>
    success(await service.save(rawInput as SaveProjectInput)),
  );
  handle(IPC_CHANNELS.projectImport, async (event) => {
    const source = await chooseDirectory(
      locations,
      event,
      'project',
      'Import an A2MaTeX project folder',
    );
    if (!source) return success(null);
    return success(await service.importProject(source));
  });
  handle(IPC_CHANNELS.projectExport, async (event, rawInput) => {
    const request = rawInput as ExportProjectInput;
    const target = await chooseDirectory(locations, event, 'target', 'Export to an empty folder');
    if (!target) return success(null);
    return success(await service.exportProject(request, target));
  });
}
