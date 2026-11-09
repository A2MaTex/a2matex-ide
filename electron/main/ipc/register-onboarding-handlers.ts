import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';

import type { OnboardingErrorCode } from '@application/onboarding/onboarding';
import type { PolicyManifest } from '@application/onboarding/policy-manifest';
import { LocationGrantError, LocationRegistry } from '@electron/main/security/location-registry';
import {
  OnboardingError,
  type OnboardingStateService,
} from '@electron/main/services/onboarding-state-service';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  if (!senderUrl.startsWith('file:') && !(developmentUrl && senderUrl.startsWith(developmentUrl))) {
    throw new Error('Untrusted IPC sender');
  }
}

function success<T>(value: T): HostResult<T, OnboardingErrorCode> {
  return { ok: true, value };
}

function failure(error: unknown): HostResult<never, OnboardingErrorCode> {
  const mapped =
    error instanceof OnboardingError
      ? error
      : error instanceof LocationGrantError
        ? new OnboardingError(
            'ONBOARDING_WORKSPACE_INVALID',
            'The selected workspace is no longer available.',
            true,
          )
        : new OnboardingError(
            'ONBOARDING_STATE_INVALID',
            'Onboarding could not be completed.',
            true,
          );
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

export function registerOnboardingHandlers(
  service: OnboardingStateService,
  loadPolicies: () => Promise<PolicyManifest>,
) {
  const locations = new LocationRegistry();

  ipcMain.removeHandler(IPC_CHANNELS.onboardingGetState);
  ipcMain.handle(IPC_CHANNELS.onboardingGetState, async (event) => {
    try {
      assertTrustedSender(event);
      return success(await service.getState());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.onboardingChooseWorkspace);
  ipcMain.handle(IPC_CHANNELS.onboardingChooseWorkspace, async (event) => {
    try {
      assertTrustedSender(event);
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: 'Choose the default export folder',
        properties: ['openDirectory', 'createDirectory'] as Array<
          'openDirectory' | 'createDirectory'
        >,
      };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return success(null);
      const location = await locations.register(result.filePaths[0], 'target');
      return success({ capability: location.id, label: location.displayPath });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.onboardingGetPolicies);
  ipcMain.handle(IPC_CHANNELS.onboardingGetPolicies, async (event) => {
    try {
      assertTrustedSender(event);
      return success(await loadPolicies());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.onboardingComplete);
  ipcMain.handle(IPC_CHANNELS.onboardingComplete, async (event, input: unknown) => {
    try {
      assertTrustedSender(event);
      const capability =
        input && typeof input === 'object' ? Reflect.get(input, 'workspaceCapability') : null;
      const projectRoot =
        typeof capability === 'string'
          ? locations.resolve({ id: capability, displayPath: '' }, ['target'])
          : null;
      const policies = await loadPolicies();
      const terms = policies.documents.find((policy) => policy.id === 'terms')?.version ?? '';
      const privacy = policies.documents.find((policy) => policy.id === 'privacy')?.version ?? '';
      return success(await service.complete(input, projectRoot, { terms, privacy }));
    } catch (error) {
      return failure(error);
    }
  });
}
