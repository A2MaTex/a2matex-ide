import * as Dialog from '@radix-ui/react-dialog';
import { CirclePlay, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { RuntimeStartDeviceInput } from '@application/runtime/runtime.types';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';
import { DevicePicker } from '@presentation/features/test-run/DevicePicker';
import { useMultiDeviceWorkflowInputs } from '@presentation/features/test-run/useMultiDeviceWorkflowInputs';
import { WorkflowInputsForm } from '@presentation/features/test-run/WorkflowInputsForm';
import { useTestRun } from '@presentation/features/test-run/useTestRun';

interface TestRunDialogProps {
  busy: boolean;
  hostReady: boolean;
  inputSchema: JsonValue;
  onOpenChange(open: boolean): void;
  onRun(input: RuntimeStartDeviceInput[]): Promise<void> | void;
  open: boolean;
  runBlockedReason?: string | null;
}

export function TestRunDialog({
  busy,
  hostReady,
  inputSchema,
  onOpenChange,
  onRun,
  open,
  runBlockedReason = null,
}: TestRunDialogProps) {
  const devices = useTestRun(open);
  const inputs = useMultiDeviceWorkflowInputs(inputSchema, devices.selectedAdbSerials);
  const [activeInputSerial, setActiveInputSerial] = useState<string | null>(null);
  const selectedInputSerial =
    activeInputSerial && devices.selectedAdbSerials.includes(activeInputSerial)
      ? activeInputSerial
      : (devices.selectedAdbSerials.at(0) ?? null);

  const canRun =
    hostReady && !busy && !runBlockedReason && devices.allSelectedReady && inputs.valid;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canRun) return;
    void onRun(
      devices.selectedAdbSerials.map((adbSerial) => ({
        adbSerial,
        inputs: inputs.valuesFor(adbSerial),
      })),
    );
  };

  const activeDeviceInputs = selectedInputSerial ? inputs.deviceStates[selectedInputSerial] : null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl outline-none">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-cyan-400">
              <CirclePlay className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">Test Run</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                Choose one or more Runtime-ready Android devices and provide inputs for each member.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label="Close Test Run dialog"
              >
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <form className="mt-6" onSubmit={submit}>
            <DevicePicker
              devices={devices.devices}
              disabled={busy}
              error={devices.error}
              initialLoading={devices.initialLoading}
              onRefresh={() => void devices.refresh()}
              onSelect={devices.select}
              refreshing={devices.refreshing}
              selectedAdbSerials={devices.selectedAdbSerials}
              unavailableSelections={devices.unavailableSelections}
            />
            <div className="my-6 border-t border-border" />
            <WorkflowInputsForm
              disabled={busy}
              heading="Shared input defaults"
              idPrefix="test-run-shared-input"
              description="Edit reusable defaults, then explicitly copy them to all selected devices. Existing device values do not change automatically."
              state={inputs.shared}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <p className="text-[11px] text-muted-foreground">
                {devices.selectedAdbSerials.length} device
                {devices.selectedAdbSerials.length === 1 ? '' : 's'} selected
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !inputs.shared.valid || devices.selectedAdbSerials.length === 0}
                onClick={inputs.applySharedDefaults}
              >
                Apply to selected devices
              </Button>
            </div>

            {devices.selectedAdbSerials.length > 0 ? (
              <div className="mt-5 rounded-lg border border-border bg-background/30 p-3">
                <div
                  className="flex max-w-full gap-1 overflow-x-auto pb-2 text-sm"
                  role="tablist"
                  aria-label="Selected device inputs"
                >
                  {devices.selectedAdbSerials.map((adbSerial) => {
                    const valid = inputs.deviceStates[adbSerial]?.valid === true;
                    return (
                      <button
                        key={adbSerial}
                        type="button"
                        role="tab"
                        aria-selected={selectedInputSerial === adbSerial}
                        onClick={() => setActiveInputSerial(adbSerial)}
                        className={
                          'shrink-0 rounded-md border px-3 py-2 text-left font-mono text-[10px] ' +
                          (selectedInputSerial === adbSerial
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent/40')
                        }
                      >
                        <span className="block max-w-48 truncate">{adbSerial}</span>
                        <span
                          className={valid ? 'text-success text-xs' : 'text-destructive text-xs'}
                        >
                          {valid ? 'Inputs valid' : 'Needs attention'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedInputSerial && activeDeviceInputs ? (
                  <div className="mt-3 border-t border-border pt-4">
                    <WorkflowInputsForm
                      disabled={busy}
                      heading={`Inputs for ${selectedInputSerial}`}
                      idPrefix={`test-run-device-input-${selectedInputSerial.replace(/[^A-Za-z0-9_-]/g, '-')}`}
                      description="These values belong only to this device execution."
                      state={activeDeviceInputs}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                Select at least one READY device to configure per-device inputs.
              </p>
            )}

            {!hostReady ? (
              <p role="alert" className="mt-5 text-xs text-destructive">
                The desktop host is not ready for a Test Run.
              </p>
            ) : runBlockedReason ? (
              <p role="alert" className="mt-5 text-xs text-warning">
                {runBlockedReason}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!canRun}>
                <CirclePlay /> {busy ? 'Preparing…' : 'Run'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
