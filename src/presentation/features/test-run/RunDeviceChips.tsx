import { CircleCheck, CircleX, Loader2, PauseCircle, Smartphone, X } from 'lucide-react';

import type { RuntimeDeviceExecution } from '@application/runtime/runtime.types';

function statusIcon(status: RuntimeDeviceExecution['status']) {
  if (status === 'RUNNING') return <Loader2 className="size-3.5 animate-spin" />;
  if (status === 'SUCCEEDED') return <CircleCheck className="size-3.5" />;
  if (status === 'FAILED' || status === 'INTERRUPTED') return <CircleX className="size-3.5" />;
  if (status === 'PAUSED') return <PauseCircle className="size-3.5" />;
  return <Smartphone className="size-3.5" />;
}

/** Tier 1: which device's run the canvas shows. One chip per device of the current test run. */
export function RunDeviceChips({
  devices,
  selectedId,
  onSelect,
  onDismiss,
}: {
  devices: readonly RuntimeDeviceExecution[];
  selectedId: string | null;
  onSelect(deviceExecutionId: string): void;
  onDismiss(): void;
}) {
  if (devices.length === 0) return null;
  return (
    <div className="run-device-chips" role="toolbar" aria-label="Test run devices">
      <span className="run-device-chips-label">Run on</span>
      {devices.map((device) => (
        <button
          key={device.id}
          type="button"
          data-status={device.status}
          aria-pressed={device.id === selectedId}
          onClick={() => onSelect(device.id)}
          title={`${device.adbSerial} · ${device.status.toLowerCase()}${
            device.terminalError ? ` · ${device.terminalError.message}` : ''
          }`}
          className="run-device-chip"
        >
          {statusIcon(device.status)}
          <span className="max-w-36 truncate font-mono">{device.adbSerial}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        className="run-device-chips-close"
        aria-label="Hide run status on canvas"
        title="Hide run status on canvas"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
