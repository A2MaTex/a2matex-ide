import { AlertTriangle, RefreshCw, Smartphone } from 'lucide-react';

import type { RuntimeDevice } from '@application/runtime/runtime.types';
import { Button } from '@presentation/components/ui/button';

interface DevicePickerProps {
  devices: readonly RuntimeDevice[];
  disabled?: boolean;
  error: string | null;
  initialLoading: boolean;
  onRefresh(): void;
  onSelect(adbSerial: string, selected: boolean): void;
  refreshing: boolean;
  selectedAdbSerials: readonly string[];
  unavailableSelections: ReadonlyArray<{ adbSerial: string; message: string }>;
}

export function DevicePicker({
  devices,
  disabled = false,
  error,
  initialLoading,
  onRefresh,
  onSelect,
  refreshing,
  selectedAdbSerials,
  unavailableSelections,
}: DevicePickerProps) {
  return (
    <section aria-labelledby="test-run-device-heading">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div>
          <h3 id="test-run-device-heading" className="text-sm font-semibold">
            Runtime device
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Select one or more devices that the local Runtime reports as ready.
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

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1" aria-label="Runtime devices">
        {devices.map((device) => {
          const ready = device.status === 'READY';
          const checked = selectedAdbSerials.includes(device.adbSerial);
          return (
            <label
              key={device.adbSerial}
              className={
                'flex items-start gap-3 rounded-lg border p-3 text-xs ' +
                (checked
                  ? 'border-primary bg-primary/10'
                  : ready
                    ? 'cursor-pointer border-border bg-background/40 hover:bg-accent/40'
                    : 'border-border bg-secondary/25 opacity-75')
              }
            >
              <input
                type="checkbox"
                value={device.adbSerial}
                checked={checked}
                disabled={disabled || !ready}
                onChange={(event) => onSelect(device.adbSerial, event.target.checked)}
                className="mt-1"
              />
              <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-foreground">
                  {device.adbSerial}
                </span>
                <span
                  className={
                    'mt-1 block text-[10px] font-medium uppercase tracking-wider ' +
                    (ready ? 'text-success' : 'text-warning')
                  }
                >
                  {device.status}
                </span>
                {device.error ? (
                  <span className="mt-1 block text-[11px] leading-4 text-destructive">
                    {device.error.message}
                    <span className="ml-1 font-mono text-[10px]">({device.error.code})</span>
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      {unavailableSelections.length > 0 ? (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
          <p className="font-medium text-warning">Selected devices need attention</p>
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
                  onClick={() => onSelect(selection.adbSerial, false)}
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
