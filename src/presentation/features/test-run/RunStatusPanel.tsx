import { AlertTriangle, CirclePlay, LoaderCircle, RotateCw } from 'lucide-react';

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
              Run ID
              <strong className="mt-0.5 block break-all font-mono text-foreground">
                {snapshot.runGroup.id}
              </strong>
            </span>
            <span>
              Request ID
              <strong className="mt-0.5 block break-all font-mono text-foreground">
                {snapshot.runGroup.requestId}
              </strong>
            </span>
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

          <div className="mt-4 grid gap-2">
            {snapshot.deviceExecutions.map((execution) => (
              <div
                key={execution.id}
                className="rounded-md border border-border bg-background/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{execution.adbSerial}</span>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] ${statusTone(execution.status)}`}
                  >
                    {execution.status}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <span>Next node: {execution.nextNodeId ?? '—'}</span>
                  <span>Started: {displayTimestamp(execution.startedAt)}</span>
                </div>
                {execution.terminalError ? (
                  <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    {execution.terminalError.message}
                    <span className="ml-1 font-mono text-[10px]">
                      ({execution.terminalError.code})
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

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
