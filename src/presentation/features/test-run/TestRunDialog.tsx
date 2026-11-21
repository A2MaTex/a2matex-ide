import * as Dialog from '@radix-ui/react-dialog';
import { CirclePlay, X } from 'lucide-react';
import type { FormEvent } from 'react';

import type { RuntimeStartDeviceInput } from '@application/runtime/runtime.types';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';
import { DevicePicker } from '@presentation/features/test-run/DevicePicker';
import { WorkflowInputsForm } from '@presentation/features/test-run/WorkflowInputsForm';
import { useTestRun } from '@presentation/features/test-run/useTestRun';
import { useWorkflowInputs } from '@presentation/features/test-run/useWorkflowInputs';

interface TestRunDialogProps {
  busy: boolean;
  hostReady: boolean;
  inputSchema: JsonValue;
  onOpenChange(open: boolean): void;
  onRun(input: RuntimeStartDeviceInput): Promise<void> | void;
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
  const inputs = useWorkflowInputs(inputSchema);
  const canRun =
    hostReady && !busy && !runBlockedReason && devices.selectedDevice !== null && inputs.valid;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canRun || !devices.selectedDevice) return;
    void onRun({ adbSerial: devices.selectedDevice.adbSerial, inputs: inputs.values });
  };

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
                Choose one Runtime-ready Android device and provide the entry workflow inputs.
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
              selectedAdbSerial={devices.selectedAdbSerial}
            />
            <div className="my-6 border-t border-border" />
            <WorkflowInputsForm disabled={busy} state={inputs} />

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
