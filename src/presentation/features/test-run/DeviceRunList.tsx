import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';

import type { RuntimeDevice } from '@application/runtime/runtime.types';
import { Button } from '@presentation/components/ui/button';

interface DeviceRunListProps {
  devices: readonly RuntimeDevice[];
  disabled?: boolean;
  error: string | null;
  expandedAdbSerial: string | null;
  initialLoading: boolean;
  inputsValid(adbSerial: string): boolean;
  onExpand(adbSerial: string | null): void;
  onRefresh(): void;
  onSelect(adbSerial: string, selected: boolean): void;
  refreshing: boolean;
  renderInputs(adbSerial: string): ReactNode;
  selectedAdbSerials: readonly string[];
  unavailableSelections: ReadonlyArray<{ adbSerial: string; message: string }>;
}

/**
 * One row per Runtime device. Checking a device includes it in the run; the checked device that
 * is expanded shows its input form right under its row, so a device is picked and configured in
 * one place.
 */
export function DeviceRunList({
  devices,
  disabled = false,
  error,
  expandedAdbSerial,
  initialLoading,
  inputsValid,
  onExpand,
  onRefresh,
  onSelect,
  refreshing,
  renderInputs,
  selectedAdbSerials,
  unavailableSelections,
}: DeviceRunListProps) {
  const toggleChecked = (adbSerial: string, checked: boolean) => {
    onSelect(adbSerial, checked);
    if (checked) onExpand(adbSerial);
    else if (expandedAdbSerial === adbSerial) onExpand(null);
  };

  return (
    <section aria-labelledby="test-run-device-heading">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div>
          <h3 id="test-run-device-heading" className="text-sm font-semibold">
            Devices
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Check the devices to run. Click a device to fill in its inputs.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={disabled || initialLoading || refreshing}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          {refreshing ? 'Refreshing…' : 'Refresh devices'}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Device refresh failed</p>
            <p className="mt-1 text-[11px] leading-4">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2" aria-label="Runtime devices">
        {devices.map((device) => {
          const ready = device.status === 'READY';
          const checked = selectedAdbSerials.includes(device.adbSerial);
          const expanded = checked && expandedAdbSerial === device.adbSerial;
          const valid = checked && inputsValid(device.adbSerial);
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <div
              key={device.adbSerial}
              className={
                'rounded-lg border text-xs ' +
                (checked
                  ? 'border-primary/70 bg-primary/5'
                  : ready
                    ? 'border-border bg-background/40'
                    : 'border-border bg-secondary/25 opacity-75')
              }
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`Run on ${device.adbSerial}`}
                  checked={checked}
                  disabled={disabled || (!ready && !checked)}
                  onChange={(event) => toggleChecked(device.adbSerial, event.target.checked)}
                />
                <button
                  type="button"
                  aria-expanded={expanded}
                  disabled={disabled || (!ready && !checked)}
                  onClick={() =>
                    checked
                      ? onExpand(expanded ? null : device.adbSerial)
                      : toggleChecked(device.adbSerial, true)
                  }
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                >
                  <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-foreground">
                      {device.adbSerial}
                    </span>
                    {device.error ? (
                      <span className="mt-0.5 block text-[11px] leading-4 text-destructive">
                        {device.error.message}
                        <span className="ml-1 font-mono text-[10px]">({device.error.code})</span>
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={
                      'shrink-0 text-[10px] font-medium uppercase tracking-wider ' +
                      (ready ? 'text-success' : 'text-warning')
                    }
                  >
                    {device.status}
                  </span>
                  {checked ? (
                    <span
                      className={
                        'w-24 shrink-0 text-right text-[11px] ' +
                        (valid ? 'text-success' : 'text-destructive')
                      }
                    >
                      {valid ? 'Inputs ready' : 'Needs inputs'}
                    </span>
                  ) : (
                    <span className="w-24 shrink-0" />
                  )}
                  <Chevron
                    className={
                      'size-4 shrink-0 ' + (checked ? 'text-muted-foreground' : 'opacity-0')
                    }
                  />
                </button>
              </div>
              {expanded ? (
                <div className="border-t border-border px-4 py-4">
                  {renderInputs(device.adbSerial)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {unavailableSelections.length > 0 ? (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
          <p className="font-medium text-warning">Checked devices need attention</p>
          <div className="mt-2 space-y-2">
            {unavailableSelections.map((selection) => (
              <div key={selection.adbSerial} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block break-all font-mono text-[10px] text-foreground">
                    {selection.adbSerial}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {selection.message}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => toggleChecked(selection.adbSerial, false)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {initialLoading && devices.length === 0 ? (
        <p className="mt-3 rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground">
          Loading cached Runtime devices…
        </p>
      ) : null}
      {!initialLoading && devices.length === 0 ? (
        <p className="mt-3 rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground">
          No Runtime devices found. Start an emulator or connect and authorize an Android device,
          then refresh.
        </p>
      ) : null}
    </section>
  );
}
