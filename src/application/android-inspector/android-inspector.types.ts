import type { AndroidDevice, InspectorSnapshot } from '@domain/android-inspector/android-inspector';

export interface AndroidInspectorService {
  listDevices(): Promise<AndroidDevice[]>;
  capture(deviceId: string): Promise<InspectorSnapshot>;
}
