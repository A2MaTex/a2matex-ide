import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  AndroidInspectorError,
  toAndroidInspectorError,
  type AndroidInspectorErrorCode,
  type AndroidInspectorService,
} from '@application/android-inspector/android-inspector';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

function success<T>(value: T): HostResult<T, AndroidInspectorErrorCode> {
  return { ok: true, value };
}

function failure(error: unknown): HostResult<never, AndroidInspectorErrorCode> {
  const mapped = toAndroidInspectorError(error);
  return {
    ok: false,
    error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
  };
}

function parseCaptureInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  const deviceId = Reflect.get(input, 'deviceId');
  const hasControlCharacter =
    typeof deviceId === 'string' &&
    Array.from(deviceId).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    });
  if (
    keys.length !== 1 ||
    keys[0] !== 'deviceId' ||
    typeof deviceId !== 'string' ||
    deviceId.trim().length === 0 ||
    deviceId.length > 256 ||
    hasControlCharacter
  ) {
    return null;
  }
  return { deviceId: deviceId.trim() };
}

export function registerAndroidInspectorHandlers(service: AndroidInspectorService) {
  ipcMain.removeHandler(IPC_CHANNELS.androidInspectorListDevices);
  ipcMain.handle(IPC_CHANNELS.androidInspectorListDevices, async (event) => {
    try {
      assertTrustedSender(event);
      return success(await service.listDevices());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.removeHandler(IPC_CHANNELS.androidInspectorCapture);
  ipcMain.handle(IPC_CHANNELS.androidInspectorCapture, async (event, rawInput: unknown) => {
    try {
      assertTrustedSender(event);
      const input = parseCaptureInput(rawInput);
      if (!input) {
        throw new AndroidInspectorError(
          'INSPECTOR_INVALID_INPUT',
          'A valid Android device ID is required.',
          false,
        );
      }
      return success(await service.capture(input.deviceId));
    } catch (error) {
      return failure(error);
    }
  });
}
