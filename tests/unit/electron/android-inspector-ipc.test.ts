import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AndroidInspectorError,
  type AndroidInspectorService,
} from '@application/android-inspector/android-inspector';
import { registerAndroidInspectorHandlers } from '@electron/main/ipc/register-android-inspector-handlers';
import { IPC_CHANNELS } from '@electron/shared/channels';

const { handlers, ipcMain } = vi.hoisted(() => {
  const stored = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers: stored,
    ipcMain: {
      removeHandler: vi.fn((channel: string) => stored.delete(channel)),
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        stored.set(channel, handler);
      }),
    },
  };
});

vi.mock('electron', () => ({ ipcMain }));

const trustedEvent = {
  senderFrame: { url: 'file:///studio/index.html' },
  sender: { getURL: () => 'file:///studio/index.html' },
};

function service(overrides: Partial<AndroidInspectorService> = {}): AndroidInspectorService {
  return {
    listDevices: vi.fn(async () => []),
    capture: vi.fn(async () => {
      throw new Error('Not used');
    }),
    ...overrides,
  };
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

describe('Android Inspector IPC handlers', () => {
  it('returns device enumeration through a typed HostResult', async () => {
    registerAndroidInspectorHandlers(
      service({
        listDevices: vi.fn(async () => [
          { deviceId: 'emulator-5554', status: 'device', usable: true },
        ]),
      }),
    );
    const handler = handlers.get(IPC_CHANNELS.androidInspectorListDevices)!;

    await expect(handler(trustedEvent)).resolves.toEqual({
      ok: true,
      value: [{ deviceId: 'emulator-5554', status: 'device', usable: true }],
    });
  });

  it('validates capture input before calling the service', async () => {
    const capture = vi.fn();
    registerAndroidInspectorHandlers(service({ capture }));
    const handler = handlers.get(IPC_CHANNELS.androidInspectorCapture)!;

    await expect(handler(trustedEvent, { deviceId: '', extra: true })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INSPECTOR_INVALID_INPUT', retryable: false },
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('maps service errors without exposing raw command details', async () => {
    registerAndroidInspectorHandlers(
      service({
        capture: vi.fn(async () => {
          throw new AndroidInspectorError('DEVICE_OFFLINE', 'Device is offline.', true);
        }),
      }),
    );
    const handler = handlers.get(IPC_CHANNELS.androidInspectorCapture)!;

    await expect(handler(trustedEvent, { deviceId: 'emulator-5554' })).resolves.toEqual({
      ok: false,
      error: { code: 'DEVICE_OFFLINE', message: 'Device is offline.', retryable: true },
    });
  });
});
