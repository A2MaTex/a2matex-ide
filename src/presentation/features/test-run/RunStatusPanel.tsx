import {
  AlertTriangle,
  CirclePlay,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Square,
} from 'lucide-react';

import { Button } from '@presentation/components/ui/button';
import { ArtifactPreview } from '@presentation/features/test-run/ArtifactPreview';
import {
  runControlAvailability,
  type RunControlAction,
} from '@presentation/features/test-run/run-controls';
import type { TestRunExecutionState } from '@presentation/features/test-run/useTestRunExecution';

interface RunStatusPanelProps {
  onCheckControl(): void;
  onControl(action: RunControlAction): void;
  onRecover(): void;
  onRetryAdmission(): void;
  /** Node selected on the canvas / matrix: its latest attempt on the selected device is shown. */
  selectedNodeId: string | null;
  state: TestRunExecutionState;
}

function displayTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function statusTone(status: string) {
  if (status === 'SUCCEEDED') return 'bg-success/15 text-success';
  if (['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(status)) {
    return 'bg-destructive/15 text-destructive';
  }
  return 'bg-primary/15 text-primary';
}

export function RunStatusPanel({
  state,
  onRecover,
  onRetryAdmission,
  selectedNodeId,
  onCheckControl,
  onControl,
}: RunStatusPanelProps) {
  if (state.phase === 'idle') {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <p>No active or recovered Test Run.</p>
        <p className="mt-1">Use Run in the toolbar to select a device and workflow inputs.</p>
      </div>
    );
  }

  if (['recovering', 'preparing', 'compiling', 'starting'].includes(state.phase)) {
    const label =
      state.phase === 'recovering'
        ? 'Checking for an active Test Run…'
        : state.phase === 'compiling'
          ? 'Compiling the saved entry workflow…'
          : state.phase === 'starting'
            ? 'Submitting the Test Run…'
            : 'Preparing the saved Project Draft…';
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin text-primary" />
        {label}
      </div>
    );
  }

  const snapshot = state.snapshot;
  const selectedExecution = snapshot?.deviceExecutions.find(
    (execution) => execution.id === state.selectedDeviceExecutionId,
  );
  // Latest attempt of the selected node on the selected device, else the attempt picked by the run.
  const nodeAttempt = selectedNodeId
    ? state.attempts.filter((attempt) => attempt.nodeId === selectedNodeId).at(-1)
    : undefined;
  const selectedAttempt =
    nodeAttempt ?? state.attempts.find((attempt) => attempt.id === state.selectedAttemptId) ?? null;
  const control = state.controlState;
  const { canCancel, canPause, canResume, staleControl, terminalRun } =
    runControlAvailability(state);
  return (
    <div className="p-4 text-xs">
      {state.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">Test Run needs attention</p>
              <p className="mt-1 leading-5 text-secondary-foreground">{state.error.message}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                {state.error.runtimeCode ?? state.error.code}
              </p>
            </div>
          </div>
          {state.error.unavailableDevices?.length ? (
            <div className="mt-3 space-y-2 border-t border-destructive/20 pt-3">
              {state.error.unavailableDevices.map((device) => (
                <div key={`${device.index}:${device.adbSerial}`}>
                  <p className="break-all font-mono text-[10px] text-foreground">
                    Device {device.index + 1}: {device.adbSerial}
                  </p>
                  <p className="mt-0.5 text-[11px] text-destructive">
                    {device.reason.message} ({device.reason.code})
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {state.phase === 'uncertain' ? (
            <Button className="mt-3" size="sm" variant="secondary" onClick={onRetryAdmission}>
              <RotateCw /> Retry exact admission
            </Button>
          ) : state.phase === 'recovery-failed' || state.phase === 'lost' ? (
            <Button className="mt-3" size="sm" variant="secondary" onClick={onRecover}>
              <RotateCw /> Check active Run
            </Button>
          ) : null}
        </div>
      ) : null}

      {state.validation ? (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3">
          <p className="font-medium text-warning">Compilation diagnostics</p>
          {[...state.validation.errors, ...state.validation.warnings].map((diagnostic, index) => (
            <div key={`${diagnostic.code}:${diagnostic.path.join('.')}:${index}`} className="mt-2">
              <p className="text-secondary-foreground">{diagnostic.message}</p>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                {diagnostic.code} · {diagnostic.path.length ? diagnostic.path.join('.') : '$'}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {snapshot ? (
        <div className={state.error ? 'mt-4' : ''}>
          <div className="flex flex-wrap items-center gap-2">
            <CirclePlay className="size-4 text-primary" />
            <span className="font-medium">Run group</span>
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] ${statusTone(snapshot.runGroup.status)}`}
            >
              {snapshot.runGroup.status}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <span>
              Started
              <strong className="mt-0.5 block text-foreground">
                {displayTimestamp(snapshot.runGroup.createdAt)}
              </strong>
            </span>
            <span>
              Finished
              <strong className="mt-0.5 block text-foreground">
                {displayTimestamp(snapshot.runGroup.finishedAt)}
              </strong>
            </span>
          </div>

          <div className="mt-4 rounded-md border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">Run controls</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {!control
                    ? 'Loading native control state…'
                    : control.phase === 'SUBMITTING'
                      ? `Submitting ${control.action?.toLowerCase()}…`
                      : control.phase === 'PENDING'
                        ? `${control.action?.toLowerCase()} requested; waiting for Runtime state.`
                        : staleControl
                          ? 'Action outcome is unknown. Check the saved Runtime state before continuing.'
                          : control.resolution === 'CONFLICT'
                            ? 'The action conflicted with the current Runtime state.'
                            : 'Controls apply to every device in this run group.'}
                </p>
                {control?.lastError ? (
                  <p className="mt-1 text-[10px] text-destructive">
                    {control.lastError.message} ({control.lastError.code})
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshot.runGroup.status === 'RUNNING' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canPause}
                    onClick={() => onControl('PAUSE')}
                  >
                    <Pause /> Pause
                  </Button>
                ) : null}
                {snapshot.runGroup.status === 'PAUSED' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canResume}
                    onClick={() => onControl('RESUME')}
                  >
                    <Play /> Resume
                  </Button>
                ) : null}
                {!terminalRun ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={!canCancel}
                    onClick={() => onControl('CANCEL')}
                  >
                    <Square /> Cancel
                  </Button>
                ) : null}
                {staleControl ? (
                  <Button size="sm" variant="secondary" onClick={onCheckControl}>
                    <RefreshCw /> Check state
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {Object.entries(snapshot.runGroup.summary).map(([name, count]) => (
              <div key={name} className="rounded-md border border-border bg-background/40 p-2">
                <span className="block text-[10px] capitalize text-muted-foreground">{name}</span>
                <strong className="font-mono text-sm">{count}</strong>
              </div>
            ))}
          </div>

          {selectedExecution && selectedAttempt ? (
            <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {state.nodeLabels[selectedAttempt.nodeId] ?? selectedAttempt.nodeId}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {selectedExecution.adbSerial}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    Sequence {selectedAttempt.sequence} · attempt {selectedAttempt.attemptNumber} ·{' '}
                    {selectedAttempt.status}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {displayTimestamp(selectedAttempt.startedAt)} →{' '}
                  {displayTimestamp(selectedAttempt.finishedAt)}
                </span>
              </div>
              {selectedAttempt.output !== null ? (
                <div className="mt-3">
                  <p className="mb-1 font-medium text-foreground">Output</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[10px] text-secondary-foreground">
                    {JSON.stringify(selectedAttempt.output, null, 2)}
                  </pre>
                </div>
              ) : null}
              {selectedAttempt.error ? (
                <div className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                  {selectedAttempt.error.message}
                  <span className="ml-1 font-mono text-[10px]">({selectedAttempt.error.code})</span>
                </div>
              ) : null}
              <ArtifactPreview key={selectedAttempt.id} attempt={selectedAttempt} />
            </div>
          ) : null}
          {selectedExecution?.terminalError ? (
            <div className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
              {selectedExecution.adbSerial}: {selectedExecution.terminalError.message}
              <span className="ml-1 font-mono text-[10px]">
                ({selectedExecution.terminalError.code})
              </span>
            </div>
          ) : null}
          {state.attemptsError ? (
            <p role="status" className="mt-3 text-warning">
              Node progress refresh failed: {state.attemptsError}
            </p>
          ) : null}

          {state.observationError ? (
            <p role="status" className="mt-3 text-warning">
              Live observation: {state.observationError}. The last saved state remains visible.
            </p>
          ) : null}
          {state.phase === 'running' ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Closing this view stops polling only; it does not cancel the Runtime execution.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
