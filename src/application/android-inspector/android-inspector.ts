import type { AndroidDevice, InspectorSnapshot } from '@domain/android-inspector/android-inspector';

export type AndroidInspectorErrorCode =
  | 'ADB_NOT_FOUND'
  | 'ADB_START_FAILED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_UNAUTHORIZED'
  | 'CAPTURE_IN_PROGRESS'
  | 'CAPTURE_TIMEOUT'
  | 'SCREENSHOT_FAILED'
  | 'SCREENSHOT_TOO_LARGE'
  | 'HIERARCHY_DUMP_FAILED'
  | 'HIERARCHY_TOO_LARGE'
  | 'HIERARCHY_INVALID'
  | 'COORDINATE_SPACE_MISMATCH'
  | 'INSPECTOR_INVALID_INPUT'
  | 'INSPECTOR_INTERNAL_ERROR';

export class AndroidInspectorError extends Error {
  readonly code: AndroidInspectorErrorCode;
  readonly retryable: boolean;

  constructor(code: AndroidInspectorErrorCode, message: string, retryable = true) {
    super(message);
    this.name = 'AndroidInspectorError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toAndroidInspectorError(error: unknown) {
  if (error instanceof AndroidInspectorError) return error;
  return new AndroidInspectorError(
    'INSPECTOR_INTERNAL_ERROR',
    'Android Inspector encountered an unexpected error.',
    true,
  );
}

export interface AndroidInspectorService {
  listDevices(): Promise<AndroidDevice[]>;
  capture(deviceId: string): Promise<InspectorSnapshot>;
}
