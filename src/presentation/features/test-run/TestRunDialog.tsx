import * as Dialog from '@radix-ui/react-dialog';
import { ChevronRight, CirclePlay, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { RuntimeStartDeviceInput } from '@application/runtime/runtime.types';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';
import { DeviceRunList } from '@presentation/features/test-run/DeviceRunList';
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

const inputIdPrefix = (adbSerial: string) =>
  `test-run-device-input-${adbSerial.replace(/[^A-Za-z0-9_-]/g, '-')}`;

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
  const [expandedAdbSerial, setExpandedAdbSerial] = useState<string | null>(null);
  const [sharedOpen, setSharedOpen] = useState(false);

  const checkedCount = devices.selectedAdbSerials.length;
  const needInputs = devices.selectedAdbSerials.filter(
    (adbSerial) => inputs.deviceStates[adbSerial]?.valid !== true,
  ).length;
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

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="flex items-start gap-3 p-6 pb-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-cyan-400">
              <CirclePlay className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">Test Run</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                Check the devices to run, fill in the inputs of each one, then run them all
                together.
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

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
              <DeviceRunList
                devices={devices.devices}
                disabled={busy}
                error={devices.error}
                expandedAdbSerial={expandedAdbSerial}
                initialLoading={devices.initialLoading}
                inputsValid={(adbSerial) => inputs.deviceStates[adbSerial]?.valid === true}
                onExpand={setExpandedAdbSerial}
                onRefresh={() => void devices.refresh()}
                onSelect={devices.select}
                refreshing={devices.refreshing}
                renderInputs={(adbSerial) => {
                  const state = inputs.deviceStates[adbSerial];
                  return state ? (
                    <WorkflowInputsForm
                      disabled={busy}
                      heading={`Inputs for ${adbSerial}`}
                      idPrefix={inputIdPrefix(adbSerial)}
                      description="These values are used only by this device."
                      state={state}
                    />
                  ) : null;
                }}
                selectedAdbSerials={devices.selectedAdbSerials}
                unavailableSelections={devices.unavailableSelections}
              />

              <div className="mt-4 rounded-lg border border-border bg-background/30">
                <button
                  type="button"
                  aria-expanded={sharedOpen}
                  onClick={() => setSharedOpen((value) => !value)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                >
                  <ChevronRight
                    className={'size-4 transition-transform ' + (sharedOpen ? 'rotate-90' : '')}
                  />
                  {/* The global `button { font: inherit }` rule beats utilities on the button itself. */}
                  <span className="text-xs font-medium">Same inputs for all checked devices</span>
                </button>
                {sharedOpen ? (
                  <div className="border-t border-border px-4 py-4">
                    <WorkflowInputsForm
                      disabled={busy}
                      heading="Shared values"
                      idPrefix="test-run-shared-input"
                      description="Fill these once, then copy them to every checked device. You can still change each device afterwards."
                      state={inputs.shared}
                    />
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || !inputs.shared.valid || checkedCount === 0}
                        onClick={inputs.applySharedDefaults}
                      >
                        Copy to {checkedCount} checked device{checkedCount === 1 ? '' : 's'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
              <div className="min-w-0 text-[11px]">
                {!hostReady ? (
                  <p role="alert" className="text-destructive">
                    The desktop host is not ready for a Test Run.
                  </p>
                ) : runBlockedReason ? (
                  <p role="alert" className="text-warning">
                    {runBlockedReason}
                  </p>
                ) : checkedCount === 0 ? (
                  <p className="text-muted-foreground">Check at least one READY device.</p>
                ) : needInputs > 0 ? (
                  <p className="text-destructive">
                    {needInputs} of {checkedCount} checked device{checkedCount === 1 ? '' : 's'}{' '}
                    still {needInputs === 1 ? 'needs' : 'need'} inputs.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {checkedCount} device{checkedCount === 1 ? '' : 's'} ready to run.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" disabled={busy}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={!canRun}>
                  <CirclePlay />{' '}
                  {busy ? 'Preparing…' : checkedCount > 0 ? `Run all (${checkedCount})` : 'Run all'}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
