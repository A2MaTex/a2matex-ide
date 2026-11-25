import { CircleCheck, CircleX, Loader2, PauseCircle, Smartphone } from 'lucide-react';

import type { RuntimeDeviceExecution } from '@application/runtime/runtime.types';
import type { NodeDeviceStatus, RunOverlay } from '@presentation/features/test-run/run-overlay';

export interface RunMatrixColumn {
  nodeId: string;
  label: string;
}

const SYMBOL: Record<NodeDeviceStatus['status'], string> = {
  succeeded: '✓',
  failed: '✗',
  running: '●',
  skipped: '–',
};

function deviceIcon(status: RuntimeDeviceExecution['status']) {
  if (status === 'RUNNING') return <Loader2 className="size-3.5 animate-spin" />;
  if (status === 'SUCCEEDED') return <CircleCheck className="size-3.5" />;
  if (status === 'FAILED' || status === 'INTERRUPTED') return <CircleX className="size-3.5" />;
  if (status === 'PAUSED') return <PauseCircle className="size-3.5" />;
  return <Smartphone className="size-3.5" />;
}

function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/**
 * Device × node grid for a test run: one row per device, one column per node in flow order.
 * Columns show where a step fails everywhere; rows show a device with its own problem.
 */
export function RunMatrix({
  overlay,
  columns,
  selectedNodeId,
  onSelect,
}: {
  overlay: RunOverlay;
  columns: readonly RunMatrixColumn[];
  selectedNodeId: string | null;
  onSelect(deviceExecutionId: string, nodeId: string | null): void;
}) {
  if (overlay.devices.length === 0 || columns.length === 0) return null;
  const cell = (deviceId: string, nodeId: string) =>
    overlay.byNode.get(nodeId)?.find((entry) => entry.deviceExecutionId === deviceId) ?? null;
  const failuresPerNode = columns.map(
    (column) =>
      overlay.byNode.get(column.nodeId)?.filter((entry) => entry.status === 'failed').length ?? 0,
  );

  return (
    <section className="run-matrix" aria-label="Run status by device and node">
      <div className="run-matrix-head">
        <span className="text-[13px] font-semibold">Devices × nodes</span>
        <span className="text-xs text-muted-foreground">
          {overlay.devices.length} device{overlay.devices.length === 1 ? '' : 's'} ·{' '}
          {columns.length} nodes · click a cell to show it on the canvas
        </span>
      </div>
      <div className="run-matrix-scroll">
        <table>
          <thead>
            <tr>
              <th className="run-matrix-corner" scope="col">
                Device
              </th>
              {columns.map((column) => (
                <th
                  key={column.nodeId}
                  scope="col"
                  data-selected={column.nodeId === selectedNodeId}
                  title={column.label}
                >
                  <span>{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overlay.devices.map((device) => (
              <tr key={device.id} data-selected={device.id === overlay.selectedDeviceExecutionId}>
                <th scope="row" className="run-matrix-device" data-status={device.status}>
                  <button type="button" onClick={() => onSelect(device.id, null)}>
                    {deviceIcon(device.status)}
                    <span className="truncate font-mono">{device.adbSerial}</span>
                  </button>
                </th>
                {columns.map((column) => {
                  const entry = cell(device.id, column.nodeId);
                  const status = entry?.status ?? 'none';
                  return (
                    <td key={column.nodeId} data-selected={column.nodeId === selectedNodeId}>
                      <button
                        type="button"
                        className="run-matrix-cell"
                        data-status={status}
                        onClick={() => onSelect(device.id, column.nodeId)}
                        title={
                          entry
                            ? `${device.adbSerial} · ${column.label}: ${entry.status}` +
                              (entry.durationMs != null
                                ? ` · ${formatDuration(entry.durationMs)}`
                                : '') +
                              (entry.attempts > 1 ? ` · ${entry.attempts} attempts` : '') +
                              (entry.errorMessage ? `\n${entry.errorMessage}` : '')
                            : `${device.adbSerial} · ${column.label}: not reached`
                        }
                      >
                        <span className="run-matrix-symbol">
                          {entry ? SYMBOL[entry.status] : ''}
                        </span>
                        {entry?.durationMs != null ? (
                          <span className="run-matrix-time">
                            {formatDuration(entry.durationMs)}
                          </span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {overlay.devices.length > 1 ? (
            <tfoot>
              <tr>
                <th scope="row" className="run-matrix-device">
                  Failed on
                </th>
                {columns.map((column, index) => (
                  <td
                    key={column.nodeId}
                    className="run-matrix-total"
                    data-has={failuresPerNode[index] > 0}
                  >
                    {failuresPerNode[index] > 0
                      ? `${failuresPerNode[index]}/${overlay.devices.length}`
                      : '–'}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
