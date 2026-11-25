import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RuntimeDevice } from '@application/runtime/runtime.types';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

type DeviceResult = HostResult<RuntimeDevice[]>;

export interface TestRunDeviceState {
  allSelectedReady: boolean;
  devices: RuntimeDevice[];
  error: string | null;
  initialLoading: boolean;
  refresh(): Promise<void>;
  refreshing: boolean;
  select(adbSerial: string, selected: boolean): void;
  selectedAdbSerials: string[];
  unavailableSelections: Array<{ adbSerial: string; message: string }>;
}

function bridgeFailure(): string {
  return 'Runtime devices are only available in the desktop app.';
}

export function useTestRun(open: boolean): TestRunDeviceState {
  const [devices, setDevices] = useState<RuntimeDevice[]>([]);
  const [selectedAdbSerials, setSelectedAdbSerials] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const refreshRequestRef = useRef<Promise<DeviceResult> | null>(null);

  const applyDevices = useCallback((nextDevices: RuntimeDevice[]) => {
    setDevices(nextDevices);
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
    (adbSerial: string, selected: boolean) => {
      setSelectedAdbSerials((current) => {
        if (!selected) return current.filter((serial) => serial !== adbSerial);
        if (
          current.includes(adbSerial) ||
          !devices.some((device) => device.adbSerial === adbSerial && device.status === 'READY')
        ) {
          return current;
        }
        return [...current, adbSerial];
      });
    },
    [devices],
  );

  const unavailableSelections = useMemo(
    () =>
      selectedAdbSerials.flatMap((adbSerial) => {
        const device = devices.find((candidate) => candidate.adbSerial === adbSerial);
        if (device?.status === 'READY') return [];
        return [
          {
            adbSerial,
            message:
              device?.error?.message ??
              'This selected device is no longer present in the Runtime inventory.',
          },
        ];
      }),
    [devices, selectedAdbSerials],
  );

  return {
    allSelectedReady: selectedAdbSerials.length > 0 && unavailableSelections.length === 0,
    devices,
    error,
    initialLoading,
    refresh,
    refreshing,
    select,
    selectedAdbSerials,
    unavailableSelections,
  };
}
