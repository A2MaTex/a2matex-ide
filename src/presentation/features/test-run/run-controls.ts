import type { TestRunExecutionState } from '@presentation/features/test-run/useTestRunExecution';

export type RunControlAction = 'PAUSE' | 'RESUME' | 'CANCEL';

/** Which run-group controls (Pause / Resume / Cancel) are allowed right now. */
export function runControlAvailability(state: TestRunExecutionState) {
  const snapshot = state.snapshot;
  const control = state.controlState;
  const status = snapshot?.runGroup.status ?? null;
  const terminalRun = status
    ? ['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(status)
    : true;
  const staleControl = state.observationHealth === 'stale' || control?.phase === 'UNCERTAIN';
  const controlIdle = control?.phase === 'IDLE' || control?.phase === 'RESOLVED';
  const pendingPauseOrResume =
    control?.phase === 'PENDING' && (control.action === 'PAUSE' || control.action === 'RESUME');
  return {
    status,
    terminalRun,
    staleControl,
    canPause: status === 'RUNNING' && controlIdle && !staleControl && !terminalRun,
    canResume: status === 'PAUSED' && controlIdle && !staleControl && !terminalRun,
    canCancel: !terminalRun && !staleControl && (controlIdle || pendingPauseOrResume),
    /** A Pause / Resume / Cancel request is on its way to the Runtime. */
    busy: control?.phase === 'SUBMITTING' || control?.phase === 'PENDING',
  };
}
