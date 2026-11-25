import { createContext, useEffect, useMemo, useRef, useState } from 'react';

import type {
  RuntimeDeviceExecution,
  RuntimeNodeAttempt,
  RuntimeRunSnapshot,
} from '@application/runtime/runtime.types';

/** Status of one node on one device, as drawn on the canvas. */
export type NodeRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

export interface NodeDeviceStatus {
  deviceExecutionId: string;
  adbSerial: string;
  status: NodeRunStatus;
  attempts: number;
  errorMessage?: string;
  /** Latest attempt duration; null while it is still running. */
  durationMs?: number | null;
}

export interface RunOverlay {
  /** Device whose run the canvas shows (tier 1). */
  selectedDeviceExecutionId: string | null;
  devices: RuntimeDeviceExecution[];
  /** nodeId → status on every device that reached it (tier 2). */
  byNode: Map<string, NodeDeviceStatus[]>;
  statusFor(nodeId: string): NodeDeviceStatus | null;
}

export const RunOverlayContext = createContext<RunOverlay | null>(null);

// The host rejects pages above 100 attempts.
const PAGE_LIMIT = 100;
const REFRESH_MS = 400;

function attemptStatus(attempt: RuntimeNodeAttempt): NodeRunStatus {
  if (attempt.status === 'RUNNING') return 'running';
  if (attempt.status === 'SUCCEEDED') return 'succeeded';
  if (attempt.status === 'CANCELLED' || attempt.status === 'INTERRUPTED') return 'skipped';
  return 'failed';
}

async function loadAllAttempts(deviceExecutionId: string) {
  const host = window.studioHost;
  if (!host || typeof host.runtime.getNodeAttempts !== 'function') return null;
  const attempts: RuntimeNodeAttempt[] = [];
  let afterSequence: number | undefined;
  for (let page = 0; page < 50; page += 1) {
    const result = await host.runtime.getNodeAttempts({
      deviceExecutionId,
      afterSequence,
      limit: PAGE_LIMIT,
    });
    if (!result.ok) return null;
    attempts.push(...result.value.attempts);
    const next = result.value.nextAfterSequence;
    if (next === null || (afterSequence !== undefined && next <= afterSequence)) break;
    afterSequence = next;
  }
  return attempts;
}

/**
 * Per-node, per-device status for the current test run. Reads every device's node attempts
 * from the Runtime and refreshes while the run changes (snapshot cursor / attempt revision).
 */
export function useRunOverlay(
  snapshot: RuntimeRunSnapshot | null,
  attemptsRevision: number,
  selectedDeviceExecutionId: string | null,
): RunOverlay | null {
  const [loaded, setLoaded] = useState<{
    runGroupId: string | null;
    byDevice: Record<string, RuntimeNodeAttempt[]>;
  }>({ runGroupId: null, byDevice: {} });
  const runGroupId = snapshot?.runGroup.id ?? null;
  const deviceKey = snapshot?.deviceExecutions.map((device) => device.id).join(',') ?? '';
  const cursor = snapshot?.cursor ?? '';
  const lastLoadRef = useRef(0);

  useEffect(() => {
    if (!runGroupId || !deviceKey) return;
    let cancelled = false;
    // Throttle, not debounce: a steady stream of run events must not postpone the refresh forever.
    const wait = Math.max(0, REFRESH_MS - (Date.now() - lastLoadRef.current));
    const timer = window.setTimeout(async () => {
      lastLoadRef.current = Date.now();
      const ids = deviceKey.split(',');
      const results = await Promise.all(ids.map((id) => loadAllAttempts(id)));
      if (cancelled) return;
      const next: Record<string, RuntimeNodeAttempt[]> = {};
      ids.forEach((id, index) => {
        const attempts = results[index];
        if (attempts) next[id] = attempts;
      });
      setLoaded({ runGroupId, byDevice: next });
    }, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runGroupId, deviceKey, cursor, attemptsRevision]);

  return useMemo(() => {
    if (!snapshot) return null;
    const byNode = new Map<string, NodeDeviceStatus[]>();
    for (const device of snapshot.deviceExecutions) {
      const attempts = loaded.runGroupId === snapshot.runGroup.id ? loaded.byDevice[device.id] : [];
      const latest = new Map<string, NodeDeviceStatus>();
      for (const attempt of [...(attempts ?? [])].sort((a, b) => a.sequence - b.sequence)) {
        const previous = latest.get(attempt.nodeId);
        latest.set(attempt.nodeId, {
          deviceExecutionId: device.id,
          adbSerial: device.adbSerial,
          status: attemptStatus(attempt),
          attempts: (previous?.attempts ?? 0) + 1,
          errorMessage: attempt.error?.message,
          durationMs: attempt.finishedAt
            ? Math.max(0, Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt))
            : null,
        });
      }
      // The node a running device is on, even before its attempt is listed.
      if (device.status === 'RUNNING' && device.nextNodeId) {
        const current = latest.get(device.nextNodeId);
        if (!current || current.status !== 'running') {
          latest.set(device.nextNodeId, {
            deviceExecutionId: device.id,
            adbSerial: device.adbSerial,
            status: 'running',
            attempts: current?.attempts ?? 0,
          });
        }
      }
      for (const [nodeId, status] of latest) {
        const list = byNode.get(nodeId) ?? [];
        list.push(status);
        byNode.set(nodeId, list);
      }
    }
    const selected =
      selectedDeviceExecutionId &&
      snapshot.deviceExecutions.some((device) => device.id === selectedDeviceExecutionId)
        ? selectedDeviceExecutionId
        : (snapshot.deviceExecutions[0]?.id ?? null);
    return {
      selectedDeviceExecutionId: selected,
      devices: snapshot.deviceExecutions,
      byNode,
      statusFor: (nodeId: string) =>
        byNode.get(nodeId)?.find((entry) => entry.deviceExecutionId === selected) ?? null,
    };
  }, [loaded, selectedDeviceExecutionId, snapshot]);
}
