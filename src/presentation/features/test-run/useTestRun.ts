import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RuntimeDevice } from '@application/runtime/runtime.types';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

type DeviceResult = HostResult<RuntimeDevice[]>;

export interface TestRunDeviceState {
  devices: RuntimeDevice[];
  error: string | null;
  initialLoading: boolean;
  refresh(): Promise<void>;
  refreshing: boolean;
  select(adbSerial: string | null): void;
  selectedAdbSerial: string | null;
  selectedDevice: RuntimeDevice | null;
}

function bridgeFailure(): string {
  return 'Runtime devices are only available in the desktop app.';
}

export function useTestRun(open: boolean): TestRunDeviceState {
  const [devices, setDevices] = useState<RuntimeDevice[]>([]);
  const [selectedAdbSerial, setSelectedAdbSerial] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const refreshRequestRef = useRef<Promise<DeviceResult> | null>(null);

  const applyDevices = useCallback((nextDevices: RuntimeDevice[]) => {
    setDevices(nextDevices);
    setSelectedAdbSerial((current) =>
      current &&
      nextDevices.some((device) => device.adbSerial === current && device.status === 'READY')
        ? current
        : null,
    );
  }, []);

  const requestRefresh = useCallback((): Promise<DeviceResult> => {
    if (refreshRequestRef.current) return refreshRequestRef.current;
    const host = window.studioHost;
    if (!host) {
      return Promise.resolve({
        ok: false,
        error: { code: 'RUNTIME_UNAVAILABLE', message: bridgeFailure(), retryable: false },
      });
    }
    const request = host.runtime.refreshDevices().finally(() => {
      if (refreshRequestRef.current === request) refreshRequestRef.current = null;
    });
    refreshRequestRef.current = request;
    return request;
  }, []);

  const refreshForGeneration = useCallback(
    async (generation: number) => {
      if (generation !== generationRef.current) return;
      setRefreshing(true);
      setError(null);
      try {
        const result = await requestRefresh();
        if (generation !== generationRef.current) return;
        if (result.ok) applyDevices(result.value);
        else setError(result.error.message);
      } catch (reason) {
        if (generation !== generationRef.current) return;
        setError(reason instanceof Error ? reason.message : 'Unable to refresh Runtime devices.');
      } finally {
        if (generation === generationRef.current) setRefreshing(false);
      }
    },
    [applyDevices, requestRefresh],
  );

  const refresh = useCallback(
    () => refreshForGeneration(generationRef.current),
    [refreshForGeneration],
  );

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    if (!open) return;

    let active = true;
    const loadCachedThenRefresh = async () => {
      const host = window.studioHost;
      if (!host) {
        setError(bridgeFailure());
        return;
      }

      setInitialLoading(true);
      setError(null);
      try {
        const result = await host.runtime.listDevices();
        if (!active || generation !== generationRef.current) return;
        if (result.ok) applyDevices(result.value);
        else setError(result.error.message);
      } catch (reason) {
        if (!active || generation !== generationRef.current) return;
        setError(reason instanceof Error ? reason.message : 'Unable to load Runtime devices.');
      } finally {
        if (active && generation === generationRef.current) setInitialLoading(false);
      }

      if (active && generation === generationRef.current) {
        await refreshForGeneration(generation);
      }
    };

    void loadCachedThenRefresh();
    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [applyDevices, open, refreshForGeneration]);

  const select = useCallback(
    (adbSerial: string | null) => {
      if (adbSerial === null) {
        setSelectedAdbSerial(null);
        return;
      }
      if (devices.some((device) => device.adbSerial === adbSerial && device.status === 'READY')) {
        setSelectedAdbSerial(adbSerial);
      }
    },
    [devices],
  );

  const selectedDevice = useMemo(
    () =>
      devices.find(
        (device) => device.adbSerial === selectedAdbSerial && device.status === 'READY',
      ) ?? null,
    [devices, selectedAdbSerial],
  );

  return {
    devices,
    error,
    initialLoading,
    refresh,
    refreshing,
    select,
    selectedAdbSerial,
    selectedDevice,
  };
}
