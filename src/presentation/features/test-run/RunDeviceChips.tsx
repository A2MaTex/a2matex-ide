import {
  CircleCheck,
  CircleX,
  Loader2,
  Pause,
  PauseCircle,
  Play,
  Smartphone,
  Square,
  X,
} from 'lucide-react';

import type { RuntimeDeviceExecution } from '@application/runtime/runtime.types';
import type {
  RunControlAction,
  runControlAvailability,
} from '@presentation/features/test-run/run-controls';

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
  controls,
  onControl,
  onDismiss,
}: {
  devices: readonly RuntimeDeviceExecution[];
  selectedId: string | null;
  onSelect(deviceExecutionId: string): void;
  controls: ReturnType<typeof runControlAvailability>;
  onControl(action: RunControlAction): void;
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
      {!controls.terminalRun ? (
        <span className="run-device-chips-controls">
          {controls.status === 'PAUSED' ? (
            <button
              type="button"
              disabled={!controls.canResume}
              onClick={() => onControl('RESUME')}
              className="run-control-button"
              data-kind="resume"
              aria-label="Resume run"
              title="Resume run on all devices"
            >
              <Play className="size-3.5" />
              Resume
            </button>
          ) : (
            <button
              type="button"
              disabled={!controls.canPause}
              onClick={() => onControl('PAUSE')}
              className="run-control-button"
              aria-label="Pause run"
              title="Pause run on all devices"
            >
              {controls.busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Pause className="size-3.5" />
              )}
              Pause
            </button>
          )}
          <button
            type="button"
            disabled={!controls.canCancel}
            onClick={() => onControl('CANCEL')}
            className="run-control-button"
            data-kind="cancel"
            aria-label="Cancel run"
            title="Cancel run on all devices"
          >
            <Square className="size-3.5" />
          </button>
        </span>
      ) : null}
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
