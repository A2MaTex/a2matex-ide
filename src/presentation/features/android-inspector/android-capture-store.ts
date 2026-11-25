import { create } from 'zustand';

import type { AndroidDevice, InspectorSnapshot } from '@domain/android-inspector/android-inspector';

type ListState = 'idle' | 'loading' | 'ready' | 'error';

interface AndroidCaptureState {
  devices: AndroidDevice[];
  listState: ListState;
  deviceId: string;
  snapshot: InspectorSnapshot | null;
  capturing: boolean;
  error: string | null;
  loadDevices(): Promise<void>;
  selectDevice(deviceId: string): void;
  capture(): Promise<boolean>;
  /** Share a snapshot captured elsewhere (the Android Inspector panel). */
  adoptSnapshot(snapshot: InspectorSnapshot): void;
}

/**
 * Device list and latest screen snapshot shared by the coordinate picker and the Android
 * Inspector, so a screen captured in one place can be reused in the other.
 */
export const useAndroidCaptureStore = create<AndroidCaptureState>((set, get) => ({
  devices: [],
  listState: 'idle',
  deviceId: '',
  snapshot: null,
  capturing: false,
  error: null,

  async loadDevices() {
    if (!window.studioHost) {
      set({ listState: 'error', error: 'Device capture is available only in the desktop app.' });
      return;
    }
    set({ listState: 'loading', error: null });
    try {
      const result = await window.studioHost.androidInspector.listDevices();
      if (!result.ok) {
        set({ devices: [], listState: 'error', error: result.error.message });
        return;
      }
      const devices = result.value;
      const usable = devices.filter((device) => device.usable);
      const current = get().deviceId;
      // Keep the chosen device; otherwise pick the only usable one so the user can capture at once.
      const deviceId = usable.some((device) => device.deviceId === current)
        ? current
        : usable.length === 1
          ? usable[0].deviceId
          : '';
      set({
        devices,
        listState: 'ready',
        deviceId,
        snapshot: get().snapshot?.deviceId === deviceId ? get().snapshot : null,
      });
    } catch (reason) {
      set({
        devices: [],
        listState: 'error',
        error: reason instanceof Error ? reason.message : 'Unable to list Android devices.',
      });
    }
  },

  selectDevice(deviceId) {
    if (deviceId === get().deviceId) return;
    set({ deviceId, snapshot: null, error: null });
  },

  async capture() {
    const { deviceId } = get();
    if (!window.studioHost || !deviceId) return false;
    set({ capturing: true, error: null });
    try {
      const result = await window.studioHost.androidInspector.capture({ deviceId });
      if (get().deviceId !== deviceId) return false;
      if (!result.ok) {
        set({ capturing: false, error: result.error.message });
        return false;
      }
      set({ capturing: false, snapshot: result.value });
      return true;
    } catch (reason) {
      set({
        capturing: false,
        error: reason instanceof Error ? reason.message : 'Unable to capture the device screen.',
      });
      return false;
    }
  },

  adoptSnapshot(snapshot) {
    set({ deviceId: snapshot.deviceId, snapshot, error: null });
  },
}));

let cachedSnapshot: InspectorSnapshot | null = null;
let cachedUrl: string | null = null;

/** One object URL per snapshot, reused by every view that shows it. */
export function snapshotImageUrl(snapshot: InspectorSnapshot | null) {
  if (snapshot === cachedSnapshot) return cachedUrl;
  if (cachedUrl) URL.revokeObjectURL(cachedUrl);
  cachedSnapshot = snapshot;
  cachedUrl = snapshot
    ? URL.createObjectURL(
        new Blob([Uint8Array.from(snapshot.screenshot.bytes).buffer], { type: 'image/png' }),
      )
    : null;
  return cachedUrl;
}
