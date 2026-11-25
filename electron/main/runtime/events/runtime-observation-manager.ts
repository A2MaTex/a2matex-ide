import { randomUUID } from 'node:crypto';

import { RuntimeError, toRuntimeError } from '@application/runtime/runtime.error';
import type {
  RuntimeApiError,
  RuntimeExecutionEvent,
  RuntimeObservationEnvelope,
  RuntimeObservationStart,
  RuntimeObservationView,
  RuntimeRunSnapshot,
} from '@application/runtime/runtime.types';
import { compareRuntimeCursors } from '@electron/main/runtime/events/runtime-sse-parser';
import {
  openRuntimeEventStream,
  RuntimeEventStreamError,
} from '@electron/main/runtime/events/runtime-event-stream';
import { RuntimeHttpClient } from '@electron/main/runtime/http/runtime-http-client';
import type { RuntimeProcessManager } from '@electron/main/runtime/process/runtime-process-manager';
import { RuntimeControlManager } from '@electron/main/runtime/control/runtime-control-manager';

const INITIAL_ACK_TIMEOUT_MS = 10_000;
const REFRESH_THROTTLE_MS = 250;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

function safeError(error: unknown): RuntimeApiError {
  const mapped = toRuntimeError(error);
  return {
    code: mapped.runtimeCode ?? mapped.code,
    message: mapped.message,
    retryable: mapped.retryable,
  };
}

function cancelledError() {
  return new RuntimeError(
    'RUNTIME_REQUEST_CANCELLED',
    'The Runtime observation was stopped.',
    false,
  );
}

class RuntimeObservation {
  readonly id = randomUUID();
  private abortController = new AbortController();
  private ackTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private generation = 0;
  private lastRefreshStartedAt = 0;
  private latestPending: RuntimeObservationEnvelope | null = null;
  private publicationVersion = 1;
  private reconnectIndex = 0;
  private refreshDirty = false;
  private refreshFlight: Promise<void> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private sessionGeneration = 0;
  private unacknowledgedVersion = 1;
  private unsubscribeControl: (() => void) | null = null;

  private constructor(
    private readonly manager: RuntimeProcessManager,
    private readonly controls: RuntimeControlManager,
    private readonly runGroupId: string,
    private readonly listener: (envelope: RuntimeObservationEnvelope) => void,
    private readonly onDisposed: (observationId: string) => void,
    private view: RuntimeObservationView,
  ) {}

  static async create(
    manager: RuntimeProcessManager,
    controls: RuntimeControlManager,
    runGroupId: string,
    listener: (envelope: RuntimeObservationEnvelope) => void,
    onDisposed: (observationId: string) => void,
  ) {
    const acquired = await manager.acquireReadySession();
    const lookup = await new RuntimeHttpClient(acquired.session).runById(runGroupId);
    manager.assertWorkGeneration?.(acquired.workGeneration);
    if (!lookup.found) {
      throw new RuntimeError(
        'RUNTIME_REQUEST_REJECTED',
        'The selected Runtime run was not found.',
        false,
        {
          httpStatus: 404,
          runtimeCode: 'RESOURCE_NOT_FOUND',
        },
      );
    }
    if (lookup.snapshot.cursor === '0') {
      throw new RuntimeError(
        'RUNTIME_INVALID_RESPONSE',
        'A saved Runtime run returned an invalid zero event watermark.',
        false,
      );
    }
    controls.reconcile(lookup.snapshot, acquired.generation);
    const observation = new RuntimeObservation(
      manager,
      controls,
      runGroupId,
      listener,
      onDisposed,
      {
        attemptsRevision: 0,
        cursor: lookup.snapshot.cursor,
        controlState: controls.stateFor(runGroupId, acquired.generation),
        error: null,
        health: 'connecting',
        liveAttempt: null,
        pendingRetry: null,
        selectedDeviceExecutionId: lookup.snapshot.deviceExecutions.at(0)?.id ?? null,
        snapshot: lookup.snapshot,
        stale: false,
      },
    );
    observation.sessionGeneration = acquired.generation;
    observation.unsubscribeControl = controls.onChanged((state) => {
      if (state.runGroupId === runGroupId) observation.applyControlState(state);
    });
    observation.ackTimer = setTimeout(() => observation.dispose(), INITIAL_ACK_TIMEOUT_MS);
    void observation.runLoop();
    return observation;
  }

  initial(): RuntimeObservationStart {
    return { observationId: this.id, initialView: this.envelope(1) };
  }

  ack(version: number) {
    this.assertActive();
    if (version !== this.unacknowledgedVersion) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The observation acknowledgement does not match the pending publication.',
        false,
      );
    }
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
    this.unacknowledgedVersion = 0;
    const pending = this.latestPending;
    this.latestPending = null;
    this.unsubscribeControl?.();
    this.unsubscribeControl = null;
    if (pending) {
      this.unacknowledgedVersion = pending.version;
      queueMicrotask(() => {
        if (!this.disposed && this.unacknowledgedVersion === pending.version)
          this.listener(pending);
      });
    }
  }

  selectDevice(deviceExecutionId: string) {
    this.assertActive();
    if (!this.view.snapshot.deviceExecutions.some((member) => member.id === deviceExecutionId)) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The selected device does not belong to this observation.',
        false,
      );
    }
    if (deviceExecutionId === this.view.selectedDeviceExecutionId) return;
    this.view = {
      ...this.view,
      attemptsRevision: this.view.attemptsRevision + 1,
      liveAttempt: null,
      pendingRetry: null,
      selectedDeviceExecutionId: deviceExecutionId,
    };
    this.publish();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.abortController.abort();
    if (this.ackTimer) clearTimeout(this.ackTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.ackTimer = null;
    this.refreshTimer = null;
    this.latestPending = null;
    this.onDisposed(this.id);
  }

  private assertActive() {
    if (this.disposed) throw cancelledError();
  }

  private envelope(version: number): RuntimeObservationEnvelope {
    return {
      observationId: this.id,
      version,
      view: {
        ...this.view,
        snapshot: {
          ...this.view.snapshot,
          runGroup: {
            ...this.view.snapshot.runGroup,
            summary: { ...this.view.snapshot.runGroup.summary },
          },
          deviceExecutions: this.view.snapshot.deviceExecutions.map((member) => ({ ...member })),
        },
      },
    };
  }

  private publish() {
    if (this.disposed) return;
    this.publicationVersion += 1;
    const envelope = this.envelope(this.publicationVersion);
    if (this.unacknowledgedVersion !== 0) {
      this.latestPending = envelope;
      return;
    }
    this.unacknowledgedVersion = envelope.version;
    this.listener(envelope);
  }

  private setHealth(
    health: RuntimeObservationView['health'],
    stale: boolean,
    error: RuntimeApiError | null,
  ) {
    if (
      this.view.health === health &&
      this.view.stale === stale &&
      this.view.error?.code === error?.code &&
      this.view.error?.message === error?.message
    ) {
      return;
    }
    this.view = { ...this.view, health, stale, error };
    this.publish();
  }

  private applyControlState(controlState: RuntimeObservationView['controlState']) {
    if (this.disposed) return;
    this.view = { ...this.view, controlState };
    this.publish();
  }

  private reconcileControl() {
    this.controls.reconcile(this.view.snapshot, this.sessionGeneration);
    this.view = {
      ...this.view,
      controlState: this.controls.stateFor(this.runGroupId, this.sessionGeneration),
    };
  }

  private validActivity() {
    this.reconnectIndex = 0;
    this.setHealth('live', false, null);
  }

  private applyEvent(event: RuntimeExecutionEvent) {
    if (compareRuntimeCursors(event.cursor, this.view.cursor) <= 0) return;
    const relevant = event.runGroupId === this.runGroupId;
    if (relevant) {
      const afterSnapshot = compareRuntimeCursors(event.cursor, this.view.snapshot.cursor) > 0;
      if (event.type === 'RUN_GROUP_STATE_CHANGED' && afterSnapshot) {
        const current = this.view.snapshot.runGroup.status;
        if (!TERMINAL_STATES.has(current) || TERMINAL_STATES.has(event.payload.status)) {
          this.view = {
            ...this.view,
            snapshot: {
              ...this.view.snapshot,
              runGroup: { ...this.view.snapshot.runGroup, status: event.payload.status },
            },
          };
        }
        this.reconcileControl();
        this.scheduleRefresh();
      } else if (event.type === 'DEVICE_EXECUTION_STATE_CHANGED' && afterSnapshot) {
        this.view = {
          ...this.view,
          snapshot: {
            ...this.view.snapshot,
            deviceExecutions: this.view.snapshot.deviceExecutions.map((member) => {
              if (member.id !== event.deviceExecutionId) return member;
              if (
                TERMINAL_STATES.has(member.status) &&
                !TERMINAL_STATES.has(event.payload.status)
              ) {
                return member;
              }
              return {
                ...member,
                status: event.payload.status,
                nextNodeId: event.payload.nextNodeId,
                ...(event.payload.error ? { terminalError: event.payload.error } : {}),
              };
            }),
          },
        };
        this.scheduleRefresh();
      } else if (
        event.type === 'NODE_ATTEMPT_STATE_CHANGED' &&
        event.deviceExecutionId === this.view.selectedDeviceExecutionId
      ) {
        this.view = {
          ...this.view,
          attemptsRevision: this.view.attemptsRevision + 1,
          liveAttempt: {
            attemptNumber: event.payload.attemptNumber,
            nodeAttemptId: event.nodeAttemptId,
            nodeId: event.nodeId,
            status: event.payload.status,
          },
          pendingRetry:
            this.view.pendingRetry?.nodeAttemptId === event.nodeAttemptId
              ? null
              : this.view.pendingRetry,
        };
      } else if (
        event.type === 'NODE_RETRY_SCHEDULED' &&
        event.deviceExecutionId === this.view.selectedDeviceExecutionId
      ) {
        this.view = {
          ...this.view,
          attemptsRevision: this.view.attemptsRevision + 1,
          pendingRetry: {
            delayMs: event.payload.delayMs,
            nextAttemptNumber: event.payload.nextAttemptNumber,
            nodeAttemptId: event.nodeAttemptId,
            nodeId: event.nodeId,
          },
        };
      }
    }
    // Cursor is advanced only after the complete event has been reconciled or filtered.
    this.view = { ...this.view, cursor: event.cursor };
    if (relevant) this.publish();
  }

  private scheduleRefresh() {
    this.refreshDirty = true;
    if (this.refreshFlight || this.refreshTimer || this.disposed) return;
    const delay = Math.max(0, REFRESH_THROTTLE_MS - (Date.now() - this.lastRefreshStartedAt));
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshSnapshot();
    }, delay);
  }

  private async refreshSnapshot() {
    if (!this.refreshDirty || this.disposed || this.refreshFlight) return;
    this.refreshDirty = false;
    this.lastRefreshStartedAt = Date.now();
    const generation = this.generation;
    const flight = (async () => {
      try {
        const acquired = await this.manager.acquireReadySession();
        if (generation !== this.generation || this.disposed) return;
        if (acquired.generation !== this.sessionGeneration) {
          this.sessionGeneration = acquired.generation;
          await this.bootstrap(acquired.session, generation);
          return;
        }
        const result = await new RuntimeHttpClient(acquired.session).runById(this.runGroupId);
        if (generation !== this.generation || this.disposed) return;
        if (!result.found)
          throw new RuntimeError(
            'RUNTIME_REQUEST_REJECTED',
            'The observed run was not found.',
            false,
          );
        if (compareRuntimeCursors(result.snapshot.cursor, this.view.cursor) < 0) {
          this.refreshDirty = true;
          return;
        }
        this.applySnapshot(result.snapshot);
      } catch (error) {
        if (generation === this.generation && !this.disposed) {
          this.setHealth('stale', true, safeError(error));
          this.refreshDirty = true;
        }
      }
    })();
    this.refreshFlight = flight.finally(() => {
      this.refreshFlight = null;
      if (this.refreshDirty) this.scheduleRefresh();
    });
    await this.refreshFlight;
  }

  private applySnapshot(snapshot: RuntimeRunSnapshot) {
    const selected = snapshot.deviceExecutions.some(
      (member) => member.id === this.view.selectedDeviceExecutionId,
    )
      ? this.view.selectedDeviceExecutionId
      : (snapshot.deviceExecutions.at(0)?.id ?? null);
    const selectedMember = snapshot.deviceExecutions.find((member) => member.id === selected);
    this.view = {
      ...this.view,
      liveAttempt:
        selectedMember && TERMINAL_STATES.has(selectedMember.status) ? null : this.view.liveAttempt,
      pendingRetry:
        selectedMember && TERMINAL_STATES.has(selectedMember.status)
          ? null
          : this.view.pendingRetry,
      selectedDeviceExecutionId: selected,
      snapshot,
    };
    this.reconcileControl();
    this.publish();
  }

  private async bootstrap(
    session: Awaited<ReturnType<RuntimeProcessManager['acquireReadySession']>>['session'],
    generation: number,
  ) {
    const lookup = await new RuntimeHttpClient(session).runById(this.runGroupId);
    if (generation !== this.generation || this.disposed) return;
    if (!lookup.found || lookup.snapshot.cursor === '0') {
      throw new RuntimeError(
        'RUNTIME_INVALID_RESPONSE',
        'The observed Runtime run could not be repaired.',
        false,
      );
    }
    this.view = {
      ...this.view,
      attemptsRevision: this.view.attemptsRevision + 1,
      cursor: lookup.snapshot.cursor,
      liveAttempt: null,
      pendingRetry: null,
      snapshot: lookup.snapshot,
      stale: false,
    };
    this.applySnapshot(lookup.snapshot);
  }

  private async wait(delay: number, signal: AbortSignal) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  private async runLoop() {
    while (!this.disposed) {
      const generation = this.generation;
      try {
        const acquired = await this.manager.acquireReadySession();
        if (this.disposed || generation !== this.generation) return;
        if (acquired.generation !== this.sessionGeneration) {
          this.sessionGeneration = acquired.generation;
          await this.bootstrap(acquired.session, generation);
        }
        const handle = await openRuntimeEventStream({
          callbacks: {
            onEvent: (event) => {
              this.applyEvent(event);
              this.validActivity();
            },
            onHeartbeat: () => this.validActivity(),
          },
          cursor: this.view.cursor,
          session: acquired.session,
          signal: this.abortController.signal,
        });
        await handle.done;
        if (this.disposed) return;
        throw new RuntimeError('RUNTIME_UNAVAILABLE', 'The Runtime event stream closed.', true);
      } catch (error) {
        if (this.disposed || this.abortController.signal.aborted) return;
        const mapped = toRuntimeError(error);
        if (
          (error instanceof RuntimeEventStreamError &&
            (error.httpStatus === 400 ||
              (error.httpStatus === 404 && error.runtimeCode !== 'EVENT_CURSOR_EXPIRED'))) ||
          mapped.code === 'RUNTIME_INVALID_RESPONSE'
        ) {
          this.setHealth('error', true, safeError(error));
          return;
        }
        if (error instanceof RuntimeEventStreamError && error.httpStatus === 410) {
          this.setHealth('stale', true, safeError(error));
          try {
            const acquired = await this.manager.acquireReadySession();
            this.sessionGeneration = acquired.generation;
            await this.bootstrap(acquired.session, generation);
          } catch (repairError) {
            this.setHealth('stale', true, safeError(repairError));
          }
        } else {
          this.setHealth('reconnecting', true, safeError(mapped));
          try {
            const recovered = await this.manager.recoverReadySession(this.sessionGeneration);
            if (recovered.replaced) {
              this.sessionGeneration = recovered.generation;
              await this.bootstrap(recovered.session, generation);
            } else if (mapped.code === 'RUNTIME_SESSION_STALE') {
              this.setHealth('error', true, safeError(mapped));
              return;
            }
          } catch (readinessError) {
            this.setHealth('reconnecting', true, safeError(readinessError));
          }
        }
        const delay =
          RECONNECT_DELAYS_MS[Math.min(this.reconnectIndex, RECONNECT_DELAYS_MS.length - 1)];
        this.reconnectIndex += 1;
        await this.wait(delay, this.abortController.signal);
      }
    }
  }
}

export class RuntimeObservationManager {
  private readonly observations = new Map<string, RuntimeObservation>();

  constructor(
    private readonly manager: RuntimeProcessManager,
    private readonly controls: RuntimeControlManager = new RuntimeControlManager(manager),
  ) {}

  async observe(runGroupId: string, listener: (envelope: RuntimeObservationEnvelope) => void) {
    const observation = await RuntimeObservation.create(
      this.manager,
      this.controls,
      runGroupId,
      listener,
      (observationId) => {
        if (this.observations.get(observationId) === observation) {
          this.observations.delete(observationId);
        }
      },
    );
    this.observations.set(observation.id, observation);
    return observation.initial();
  }

  ack(observationId: string, version: number) {
    this.require(observationId).ack(version);
  }

  selectDevice(observationId: string, deviceExecutionId: string) {
    this.require(observationId).selectDevice(deviceExecutionId);
  }

  stop(observationId: string) {
    const observation = this.observations.get(observationId);
    if (!observation) return;
    observation.dispose();
    this.observations.delete(observationId);
  }

  stopAll() {
    for (const observation of this.observations.values()) observation.dispose();
    this.observations.clear();
  }

  private require(observationId: string) {
    const observation = this.observations.get(observationId);
    if (!observation) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The Runtime observation is no longer active.',
        false,
      );
    }
    return observation;
  }
}
