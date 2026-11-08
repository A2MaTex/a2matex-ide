import { describe, expect, it, vi } from 'vitest';

import { AndroidInspectorError } from '@application/android-inspector/android-inspector';
import type { AndroidDevice } from '@domain/android-inspector/android-inspector';
import type { AdbClient } from '@electron/main/adapters/android/adb-client';
import {
  DefaultAndroidInspectorService,
  parseScreenSize,
  readPngDimensions,
} from '@electron/main/services/android-inspector/android-inspector-service';

function png(width = 100, height = 200) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const usableDevice: AndroidDevice = {
  deviceId: 'emulator-5554',
  status: 'device',
  usable: true,
  model: 'Pixel 8',
};

const hierarchy = `<hierarchy>
  <node class="android.widget.FrameLayout" package="com.example" clickable="false" enabled="true" bounds="[0,0][100,200]">
    <node class="android.widget.Button" package="com.example" resource-id="com.example:id/login" text="Login" clickable="true" enabled="true" bounds="[40,80][60,120]" />
  </node>
</hierarchy>`;

function fakeAdb(overrides: Partial<AdbClient> = {}): AdbClient {
  return {
    listDevices: vi.fn(async () => [usableDevice]),
    captureScreenshot: vi.fn(async () => png()),
    getScreenSize: vi.fn(async () => 'Physical size: 100x200'),
    captureHierarchy: vi.fn(async () => hierarchy),
    ...overrides,
  };
}

describe('Android Inspector capture service', () => {
  it('maps device enumeration failures to a typed ADB error', async () => {
    const service = new DefaultAndroidInspectorService(
      fakeAdb({ listDevices: vi.fn(async () => Promise.reject(new Error('daemon failed'))) }),
    );

    await expect(service.listDevices()).rejects.toMatchObject({
      code: 'ADB_START_FAILED',
      retryable: true,
    });
  });

  it('assembles a normalized snapshot from PNG, display metadata and hierarchy', async () => {
    const service = new DefaultAndroidInspectorService(fakeAdb());

    const snapshot = await service.capture(usableDevice.deviceId);

    expect(snapshot).toMatchObject({
      deviceId: usableDevice.deviceId,
      screenshot: { mimeType: 'image/png', width: 100, height: 200 },
      screen: { width: 100, height: 200 },
      warnings: [],
    });
    expect(snapshot.screenshot.bytes).toBeInstanceOf(Uint8Array);
    expect(snapshot.nodes.map((node) => node.nodeId)).toEqual(['node-0', 'node-1']);
  });

  it('returns the screenshot with a warning when hierarchy capture fails', async () => {
    const service = new DefaultAndroidInspectorService(
      fakeAdb({ captureHierarchy: vi.fn(async () => Promise.reject(new Error('dump failed'))) }),
    );

    const snapshot = await service.capture(usableDevice.deviceId);

    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.warnings).toContain(
      'UI hierarchy could not be captured; the screenshot is still available.',
    );
  });

  it('disables element inspection when display and screenshot coordinate spaces differ', async () => {
    const captureHierarchy = vi.fn(async () => hierarchy);
    const service = new DefaultAndroidInspectorService(
      fakeAdb({
        getScreenSize: vi.fn(async () => 'Physical size: 1440x2560'),
        captureHierarchy,
      }),
    );

    const snapshot = await service.capture(usableDevice.deviceId);

    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.warnings).toContain(
      'Display size 1440×2560 differs from screenshot 100×200; element inspection is disabled for this snapshot.',
    );
    expect(captureHierarchy).not.toHaveBeenCalled();
  });

  it('rejects offline and missing devices before screenshot capture', async () => {
    const offline = { ...usableDevice, status: 'offline' as const, usable: false };
    const screenshot = vi.fn(async () => png());
    const offlineService = new DefaultAndroidInspectorService(
      fakeAdb({ listDevices: vi.fn(async () => [offline]), captureScreenshot: screenshot }),
    );

    await expect(offlineService.capture(offline.deviceId)).rejects.toMatchObject({
      code: 'DEVICE_OFFLINE',
    });
    expect(screenshot).not.toHaveBeenCalled();

    const missingService = new DefaultAndroidInspectorService(
      fakeAdb({ listDevices: vi.fn(async () => []) }),
    );
    await expect(missingService.capture('missing')).rejects.toMatchObject({
      code: 'DEVICE_NOT_FOUND',
    });
  });

  it('deduplicates capture requests for the same device', async () => {
    let release!: (value: Buffer) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const screenshotGate = new Promise<Buffer>((resolve) => {
      release = resolve;
    });
    const service = new DefaultAndroidInspectorService(
      fakeAdb({
        captureScreenshot: vi.fn(async () => {
          markStarted();
          return screenshotGate;
        }),
      }),
    );

    const first = service.capture(usableDevice.deviceId);
    await started;
    await expect(service.capture(usableDevice.deviceId)).rejects.toMatchObject({
      code: 'CAPTURE_IN_PROGRESS',
    });
    release(png());
    await expect(first).resolves.toMatchObject({ deviceId: usableDevice.deviceId });
  });

  it('rejects invalid PNG data with a typed screenshot error', async () => {
    const service = new DefaultAndroidInspectorService(
      fakeAdb({ captureScreenshot: vi.fn(async () => Buffer.from('not a png')) }),
    );

    await expect(service.capture(usableDevice.deviceId)).rejects.toMatchObject({
      code: 'SCREENSHOT_FAILED',
    });
  });
});

describe('Android Inspector capture metadata helpers', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(readPngDimensions(png(1080, 1920))).toEqual({ width: 1080, height: 1920 });
    expect(() => readPngDimensions(Buffer.alloc(24))).toThrowError(AndroidInspectorError);
  });

  it('prefers the final override display size', () => {
    expect(parseScreenSize('Physical size: 1080x1920\nOverride size: 720x1280')).toEqual({
      width: 720,
      height: 1280,
    });
    expect(parseScreenSize('unknown')).toEqual({});
  });
});
