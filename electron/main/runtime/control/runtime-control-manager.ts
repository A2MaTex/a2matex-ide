import { RuntimeError, toRuntimeError } from '@application/runtime/runtime.error';
import type {
  RuntimeApiError,
  RuntimeControlState,
  RuntimeControlSubmissionResult,
  RuntimeRunAction,
  RuntimeRunSnapshot,
  RuntimeSession,
} from '@application/runtime/runtime.types';
import { RuntimeHttpClient } from '@electron/main/runtime/http/runtime-http-client';
import type { RuntimeProcessManager } from '@electron/main/runtime/process/runtime-process-manager';

const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

function cloneState(state: RuntimeControlState): RuntimeControlState {
  return { ...state, lastError: state.lastError ? { ...state.lastError } : null };
}

function safeError(error: unknown): RuntimeApiError {
  const mapped = toRuntimeError(error);
  return {
    code: mapped.runtimeCode ?? mapped.code,
    message: mapped.message,
    retryable: mapped.retryable,
  };
}

function idleState(runGroupId: string, sessionGeneration: number): RuntimeControlState {
  return {
    action: null,
    lastError: null,
    phase: 'IDLE',
    resolution: null,
    runGroupId,
    sessionGeneration,
    submissionVersion: 0,
  };
}

function targetObserved(action: RuntimeRunAction, snapshot: RuntimeRunSnapshot) {
  if (action === 'PAUSE') return snapshot.runGroup.status === 'PAUSED';
  if (action === 'RESUME') return snapshot.runGroup.status === 'RUNNING';
  return snapshot.runGroup.status === 'CANCELLED';
}

export class RuntimeControlManager {
  private current: RuntimeControlState | null = null;
  private postInFlight = false;
  private readonly listeners = new Set<(state: RuntimeControlState) => void>();

  constructor(
    private readonly manager: RuntimeProcessManager,
    private readonly createClient: (
      session: RuntimeSession,
    ) => Pick<RuntimeHttpClient, 'runById' | 'submitRunAction'> = (session) =>
      new RuntimeHttpClient(session),
  ) {}

  stateFor(runGroupId: string, sessionGeneration: number): RuntimeControlState {
    if (this.current?.runGroupId === runGroupId) {
      if (
        this.current.sessionGeneration > 0 &&
        this.current.sessionGeneration !== sessionGeneration &&
        ['SUBMITTING', 'PENDING', 'UNCERTAIN'].includes(this.current.phase)
      ) {
        this.resolve('SESSION_ENDED');
      }
      return cloneState(this.current);
    }
    return idleState(runGroupId, sessionGeneration);
  }

  onChanged(listener: (state: RuntimeControlState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  hasUnresolved() {
    return Boolean(
      this.current && ['SUBMITTING', 'PENDING', 'UNCERTAIN'].includes(this.current.phase),
    );
  }

  async submit(
    runGroupId: string,
    action: RuntimeRunAction,
  ): Promise<RuntimeControlSubmissionResult> {
    if (this.postInFlight) {
      throw new RuntimeError(
        'RUNTIME_REQUEST_REJECTED',
        'A Runtime control request is already being submitted.',
        false,
      );
    }
    if (
      this.current?.runGroupId === runGroupId &&
      ['PENDING', 'UNCERTAIN'].includes(this.current.phase) &&
      !(this.current.phase === 'PENDING' && action === 'CANCEL' && this.current.action !== 'CANCEL')
    ) {
      throw new RuntimeError(
        'RUNTIME_REQUEST_REJECTED',
        'Check the current Runtime control outcome before submitting another action.',
        false,
      );
    }

    this.postInFlight = true;
    const submissionVersion = (this.current?.submissionVersion ?? 0) + 1;
    this.current = {
      action,
      lastError: null,
      phase: 'SUBMITTING',
      resolution: null,
      runGroupId,
      sessionGeneration: this.manager.getSessionGeneration(),
      submissionVersion,
    };
    this.notify();

    let snapshot: RuntimeRunSnapshot | null = null;
    let disposition: RuntimeControlSubmissionResult['disposition'] = null;
    try {
      const acquired = await this.manager.acquireReadySession();
      if (!this.isCurrent(runGroupId, action, submissionVersion)) {
        return {
          controlState: this.currentState(runGroupId, acquired.generation),
          disposition,
          snapshot,
        };
      }
      this.current = { ...this.current!, sessionGeneration: acquired.generation };
      this.notify();
      const result = await this.createClient(acquired.session).submitRunAction(runGroupId, action);
      snapshot = result.snapshot;
      disposition = result.disposition;
      if (snapshot.runGroup.id !== runGroupId) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The local Runtime returned an action snapshot for a different run group.',
          false,
        );
      }
      if (!this.isCurrent(runGroupId, action, submissionVersion)) {
        return {
          controlState: this.currentState(runGroupId, acquired.generation),
          disposition,
          snapshot,
        };
      }
      if (result.disposition === 'ACCEPTED') {
        this.current = { ...this.current!, phase: 'PENDING' };
      } else if (result.disposition === 'ALREADY_TARGET') {
        this.current = {
          ...this.current!,
          phase: 'RESOLVED',
          resolution: 'ALREADY_TARGET',
        };
      } else {
        this.current = {
          ...this.current!,
          lastError: result.error ?? null,
          phase: 'RESOLVED',
          resolution: 'CONFLICT',
        };
      }
      this.notify();
      return { controlState: cloneState(this.current), disposition, snapshot };
    } catch (error) {
      if (this.isCurrent(runGroupId, action, submissionVersion)) {
        const mapped = toRuntimeError(error);
        const rejected =
          mapped.httpStatus === 400 || mapped.httpStatus === 404 || mapped.httpStatus === 413;
        this.current = {
          ...this.current!,
          lastError: safeError(mapped),
          phase: rejected ? 'RESOLVED' : 'UNCERTAIN',
          resolution: rejected ? 'REJECTED' : null,
        };
        this.notify();
      }
      return {
        controlState: this.currentState(runGroupId, this.manager.getSessionGeneration()),
        disposition,
        snapshot,
      };
    } finally {
      this.postInFlight = false;
    }
  }

  async check(runGroupId: string): Promise<RuntimeControlSubmissionResult> {
    const acquired = await this.manager.acquireReadySession();
    if (
      this.current?.runGroupId === runGroupId &&
      this.current.sessionGeneration > 0 &&
      this.current.sessionGeneration !== acquired.generation
    ) {
      this.resolve('SESSION_ENDED');
      return {
        controlState: cloneState(this.current),
        disposition: null,
        snapshot: null,
      };
    }
    const lookup = await this.createClient(acquired.session).runById(runGroupId);
    this.manager.assertWorkGeneration(acquired.workGeneration);
    if (!lookup.found) {
      throw new RuntimeError(
        'RUNTIME_REQUEST_REJECTED',
        'The selected Runtime run was not found.',
        false,
        { httpStatus: 404, runtimeCode: 'RESOURCE_NOT_FOUND' },
      );
    }
    this.reconcile(lookup.snapshot, acquired.generation);
    return {
      controlState: this.stateFor(runGroupId, acquired.generation),
      disposition: null,
      snapshot: lookup.snapshot,
    };
  }

  reconcile(snapshot: RuntimeRunSnapshot, sessionGeneration: number) {
    const state = this.current;
    if (!state || state.runGroupId !== snapshot.runGroup.id) return;
    if (state.sessionGeneration > 0 && state.sessionGeneration !== sessionGeneration) {
      this.resolve('SESSION_ENDED');
      return;
    }
    if (!state.action || !['SUBMITTING', 'PENDING', 'UNCERTAIN'].includes(state.phase)) return;
    if (targetObserved(state.action, snapshot)) {
      this.resolve('TARGET_OBSERVED');
    } else if (TERMINAL_STATES.has(snapshot.runGroup.status)) {
      this.resolve('TERMINAL_WINNER');
    }
  }

  sessionEnded() {
    if (this.hasUnresolved()) this.resolve('SESSION_ENDED');
  }

  private currentState(runGroupId: string, generation: number) {
    return this.current?.runGroupId === runGroupId
      ? cloneState(this.current)
      : idleState(runGroupId, generation);
  }

  private isCurrent(runGroupId: string, action: RuntimeRunAction, submissionVersion: number) {
    return (
      this.current?.runGroupId === runGroupId &&
      this.current.action === action &&
      this.current.submissionVersion === submissionVersion
    );
  }

  private resolve(resolution: NonNullable<RuntimeControlState['resolution']>) {
    if (!this.current) return;
    this.current = { ...this.current, phase: 'RESOLVED', resolution };
    this.notify();
  }

  private notify() {
    if (!this.current) return;
    const state = cloneState(this.current);
    for (const listener of this.listeners) listener(state);
  }
}
