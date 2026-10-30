import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { IPC_CHANNELS } from '@electron/shared/channels';
import { LocationRegistry, type LocationKind } from '@electron/main/security/location-registry';
import {
  mapProjectFileError,
  ProjectFileService,
} from '@electron/main/services/project-file-service';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

const locations = new LocationRegistry();
const projects = new ProjectFileService(locations);

function success<T>(value: T): HostResult<T> {
  return { ok: true, value };
}

function failure(error: unknown): HostResult<never> {
  const mapped = mapProjectFileError(error);
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

async function chooseDirectory(event: IpcMainInvokeEvent, kind: LocationKind, title: string) {
  assertTrustedSender(event);
  const e2eRoot = process.env.A2MATEX_E2E_PROJECT_ROOT;
  if (process.env.A2MATEX_E2E === '1' && e2eRoot) {
    return success(await locations.register(e2eRoot, kind));
  }

  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title,
    properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return success(null);
  return success(await locations.register(result.filePaths[0], kind));
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

export function registerProjectHandlers() {
  handle(IPC_CHANNELS.projectChooseCreateParent, (event) =>
    chooseDirectory(event, 'parent', 'Choose a parent folder for the new project'),
  );
  handle(IPC_CHANNELS.projectChooseOpenLocation, (event) =>
    chooseDirectory(event, 'project', 'Open an A2MaTeX project folder'),
  );
  handle(IPC_CHANNELS.projectChooseSaveAsLocation, (event) =>
    chooseDirectory(event, 'target', 'Choose an empty destination folder'),
  );
  handle(IPC_CHANNELS.projectCreate, async (_event, input) =>
    success(await projects.create(input as Parameters<ProjectFileService['create']>[0])),
  );
  handle(IPC_CHANNELS.projectOpen, async (_event, input) =>
    success(await projects.open(input as Parameters<ProjectFileService['open']>[0])),
  );
  handle(IPC_CHANNELS.projectSave, async (_event, input) =>
    success(await projects.save(input as Parameters<ProjectFileService['save']>[0])),
  );
  handle(IPC_CHANNELS.projectSaveAs, async (_event, input) => {
    const request = input as {
      snapshot: Parameters<ProjectFileService['saveAs']>[0];
      target: Parameters<ProjectFileService['saveAs']>[1];
    };
    return success(await projects.saveAs(request.snapshot, request.target));
  });
}
