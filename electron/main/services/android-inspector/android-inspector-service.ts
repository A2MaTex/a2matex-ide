import { randomUUID } from 'node:crypto';

import {
  AndroidInspectorError,
  type AndroidInspectorService,
} from '@application/android-inspector/android-inspector';
import type { AndroidDevice, InspectorSnapshot } from '@domain/android-inspector/android-inspector';
import { AdbOutputLimitError, type AdbClient } from '@electron/main/adapters/android/adb-client';
import { parseUiHierarchy } from '@electron/main/services/android-inspector/ui-hierarchy-parser';

const CAPTURE_TIMEOUT_MS = 20_000;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function readPngDimensions(bytes: Buffer) {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, pngSignature.length).equals(pngSignature) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new AndroidInspectorError(
      'SCREENSHOT_FAILED',
      'ADB returned an invalid PNG screenshot.',
      true,
    );
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0 || width > 32_768 || height > 32_768) {
    throw new AndroidInspectorError(
      'SCREENSHOT_FAILED',
      'ADB returned unsupported screenshot dimensions.',
      true,
    );
  }
  return { width, height };
}

export function parseScreenSize(output: string) {
  const matches = [...output.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/gi)];
  const selected = matches.at(-1);
  if (!selected) return {};
  return { width: Number(selected[1]), height: Number(selected[2]) };
}

function deviceError(device: AndroidDevice) {
  if (device.status === 'unauthorized') {
    return new AndroidInspectorError(
      'DEVICE_UNAUTHORIZED',
      'Authorize USB debugging on the Android device, then refresh devices.',
      true,
    );
  }
  return new AndroidInspectorError(
    'DEVICE_OFFLINE',
    'The selected Android device is offline or unavailable.',
    true,
  );
}

export class DefaultAndroidInspectorService implements AndroidInspectorService {
  private readonly activeCaptures = new Set<string>();

  constructor(private readonly adb: AdbClient) {}

  private async enumerateDevices(signal?: AbortSignal) {
    try {
      return await this.adb.listDevices(signal);
    } catch (error) {
      if (error instanceof AndroidInspectorError) throw error;
      throw new AndroidInspectorError(
        'ADB_START_FAILED',
        'ADB could not enumerate Android devices.',
        true,
      );
    }
  }

  listDevices() {
    return this.enumerateDevices();
  }

  async capture(deviceId: string): Promise<InspectorSnapshot> {
    if (this.activeCaptures.has(deviceId)) {
      throw new AndroidInspectorError(
        'CAPTURE_IN_PROGRESS',
        'A capture is already running for this device.',
        true,
      );
    }
    this.activeCaptures.add(deviceId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);

    try {
      const device = (await this.enumerateDevices(controller.signal)).find(
        (candidate) => candidate.deviceId === deviceId,
      );
      if (!device) {
        throw new AndroidInspectorError(
          'DEVICE_NOT_FOUND',
          'The selected Android device is no longer connected.',
          true,
        );
      }
      if (!device.usable) throw deviceError(device);

      let screenshotBytes: Buffer;
      try {
        screenshotBytes = await this.adb.captureScreenshot(deviceId, controller.signal);
      } catch (error) {
        if (error instanceof AndroidInspectorError) throw error;
        if (error instanceof AdbOutputLimitError) {
          throw new AndroidInspectorError(
            'SCREENSHOT_TOO_LARGE',
            'The Android screenshot exceeds the 20 MiB limit.',
            true,
          );
        }
        throw new AndroidInspectorError(
          'SCREENSHOT_FAILED',
          'The Android screenshot could not be captured.',
          true,
        );
      }
      const dimensions = readPngDimensions(screenshotBytes);
      const warnings: string[] = [];
      let screen: InspectorSnapshot['screen'] = {};
      let coordinateSpaceCompatible = true;
      try {
        screen = parseScreenSize(await this.adb.getScreenSize(deviceId, controller.signal));
        if (
          screen.width &&
          screen.height &&
          !(
            (screen.width === dimensions.width && screen.height === dimensions.height) ||
            (screen.width === dimensions.height && screen.height === dimensions.width)
          )
        ) {
          coordinateSpaceCompatible = false;
          warnings.push(
            `Display size ${screen.width}×${screen.height} differs from screenshot ${dimensions.width}×${dimensions.height}; element inspection is disabled for this snapshot.`,
          );
        }
      } catch (error) {
        if (error instanceof AndroidInspectorError && error.code === 'CAPTURE_TIMEOUT') throw error;
        warnings.push('Display metadata is unavailable for this snapshot.');
      }

      let nodes: InspectorSnapshot['nodes'] = [];
      if (coordinateSpaceCompatible) {
        const remotePath = `/sdcard/a2matex-inspector-${randomUUID()}.xml`;
        try {
          const hierarchy = await this.adb.captureHierarchy(
            deviceId,
            remotePath,
            controller.signal,
          );
          const parsed = parseUiHierarchy(hierarchy);
          nodes = parsed.nodes;
          warnings.push(...parsed.warnings);
        } catch (error) {
          if (error instanceof AndroidInspectorError && error.code === 'CAPTURE_TIMEOUT')
            throw error;
          warnings.push(
            error instanceof AdbOutputLimitError
              ? 'UI hierarchy exceeded the 5 MiB limit; element inspection is unavailable.'
              : 'UI hierarchy could not be captured; the screenshot is still available.',
          );
        }
      }

      return {
        snapshotId: randomUUID(),
        deviceId,
        capturedAt: new Date().toISOString(),
        screenshot: {
          mimeType: 'image/png',
          ...dimensions,
          bytes: Uint8Array.from(screenshotBytes),
        },
        screen,
        nodes,
        warnings,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AndroidInspectorError(
          'CAPTURE_TIMEOUT',
          'Android Inspector capture timed out.',
          true,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      this.activeCaptures.delete(deviceId);
    }
  }
}
