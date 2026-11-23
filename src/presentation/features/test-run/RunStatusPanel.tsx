import { AlertTriangle, Check, CirclePlay, Clock3, LoaderCircle, RotateCw, X } from 'lucide-react';

import { Button } from '@presentation/components/ui/button';
import type { TestRunExecutionState } from '@presentation/features/test-run/useTestRunExecution';

interface RunStatusPanelProps {
  onRecover(): void;
  onRetryAdmission(): void;
  state: TestRunExecutionState;
}

function displayTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function displayDuration(startedAt: string, finishedAt: string | null) {
  const duration = Math.max(
    0,
    (finishedAt ? new Date(finishedAt).getTime() : Date.now()) - new Date(startedAt).getTime(),
  );
  if (duration < 1_000) return `${duration} ms`;
  if (duration < 60_000) return `${(duration / 1_000).toFixed(duration < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.floor((duration % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function attemptIsSuccessful(status: string) {
  return status === 'SUCCEEDED';
}

function attemptIsRunning(status: string) {
  return status === 'RUNNING';
}

function statusTone(status: string) {
  if (status === 'SUCCEEDED') return 'bg-success/15 text-success';
  if (['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(status)) {
    return 'bg-destructive/15 text-destructive';
  }
  return 'bg-primary/15 text-primary';
}

export function RunStatusPanel({ state, onRecover, onRetryAdmission }: RunStatusPanelProps) {
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

          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {Object.entries(snapshot.runGroup.summary).map(([name, count]) => (
              <div key={name} className="rounded-md border border-border bg-background/40 p-2">
                <span className="block text-[10px] capitalize text-muted-foreground">{name}</span>
                <strong className="font-mono text-sm">{count}</strong>
              </div>
            ))}
          </div>

          {snapshot.deviceExecutions[0] ? (
            <div className="mt-4 rounded-md border border-border bg-background/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">Execution progress</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {state.attempts.filter((attempt) => attemptIsSuccessful(attempt.status)).length}{' '}
                    completed
                    {state.attempts.some((attempt) => attemptIsRunning(attempt.status))
                      ? ' · 1 running'
                      : ''}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] ${statusTone(snapshot.deviceExecutions[0].status)}`}
                >
                  {snapshot.deviceExecutions[0].status}
                </span>
              </div>

              {state.attempts.length > 0 ? (
                <div className="mt-4 overflow-x-auto pb-2">
                  <div
                    role="list"
                    aria-label="Node execution progress"
                    data-orientation="horizontal"
                    className="grid min-w-full items-start pt-1"
                    style={{
                      gridTemplateColumns: `repeat(${state.attempts.length}, minmax(11rem, 1fr))`,
                      minWidth: `${state.attempts.length * 176}px`,
                    }}
                  >
                    {state.attempts.map((attempt, index) => {
                      const successful = attemptIsSuccessful(attempt.status);
                      const running = attemptIsRunning(attempt.status);
                      const label =
                        state.nodeLabels[attempt.nodeId] ?? `Workflow step ${index + 1}`;
                      return (
                        <div
                          key={attempt.id}
                          role="listitem"
                          className="relative min-w-0 px-3 pt-8 text-center"
                        >
                          {index < state.attempts.length - 1 ? (
                            <span
                              aria-hidden="true"
                              className={`absolute left-1/2 top-[11px] h-px w-full ${successful ? 'bg-success' : 'bg-border'}`}
                            />
                          ) : null}
                          <span
                            aria-hidden="true"
                            className={`absolute left-1/2 top-0 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border ${
                              successful
                                ? 'border-success bg-success text-background'
                                : running
                                  ? 'border-primary bg-background text-primary'
                                  : 'border-destructive bg-background text-destructive'
                            }`}
                          >
                            {successful ? (
                              <Check className="size-3.5" strokeWidth={3} />
                            ) : running ? (
                              <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                              <X className="size-3.5" strokeWidth={3} />
                            )}
                          </span>
                          <p
                            className="truncate font-medium text-secondary-foreground"
                            title={label}
                          >
                            {label}
                          </p>
                          {attempt.attemptNumber > 1 ? (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              Retry attempt {attempt.attemptNumber}
                            </p>
                          ) : null}
                          <p
                            className={`mt-1 font-mono text-[10px] ${
                              successful
                                ? 'text-success'
                                : running
                                  ? 'text-primary'
                                  : 'text-destructive'
                            }`}
                            title={`Started ${displayTimestamp(attempt.startedAt)}`}
                          >
                            {attempt.status} ·{' '}
                            {displayDuration(attempt.startedAt, attempt.finishedAt)}
                          </p>
                          {attempt.error &&
                          (snapshot.deviceExecutions[0].terminalError?.code !==
                            attempt.error.code ||
                            snapshot.deviceExecutions[0].terminalError?.message !==
                              attempt.error.message) ? (
                            <p className="mt-1 line-clamp-2 text-[10px] text-destructive">
                              {attempt.error.message}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 rounded border border-dashed border-border px-3 py-4 text-muted-foreground">
                  <Clock3 className="size-4" />
                  Waiting for the first node to start…
                </div>
              )}

              {state.attemptsError ? (
                <p role="status" className="mt-3 text-warning">
                  Node progress refresh failed: {state.attemptsError}
                </p>
              ) : null}
              {snapshot.deviceExecutions[0].terminalError ? (
                <div className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                  {snapshot.deviceExecutions[0].terminalError.message}
                  <span className="ml-1 font-mono text-[10px]">
                    ({snapshot.deviceExecutions[0].terminalError.code})
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {state.pollError ? (
            <p role="status" className="mt-3 text-warning">
              Snapshot refresh failed: {state.pollError}. Retrying without changing Run status.
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
