import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  ScanSearch,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type {
  AndroidDevice,
  InspectorNode,
  InspectorSnapshot,
} from '@domain/android-inspector/android-inspector';
import {
  createAndroidSelectorV1,
  type AndroidSelectorTarget,
  type AndroidSelectorV1,
} from '@domain/android-inspector/android-selector';
import { getInspectorCandidates } from '@domain/android-inspector/geometry';
import { Button } from '@presentation/components/ui/button';
import { ScreenshotViewport } from '@presentation/features/android-inspector/ScreenshotViewport';
import { copyText } from '@infrastructure/clipboard/copy-text';

type DeviceListState = 'idle' | 'loading' | 'ready' | 'error';
type CaptureState = 'idle' | 'capturing' | 'ready' | 'stale' | 'error';

interface AndroidInspectorPanelProps {
  collapsed: boolean;
  selectorTargets?: readonly AndroidSelectorTarget[];
  onActivate?(): boolean;
  onCollapse(): void;
  onExpand(): void;
  onUseSelector?(target: AndroidSelectorTarget, selector: AndroidSelectorV1): boolean;
}

function deviceLabel(device: AndroidDevice) {
  return `${device.model ?? 'Android device'} — ${device.deviceId}${
    device.usable ? '' : ` (${device.status})`
  }`;
}

function shortClassName(className: string) {
  return className.split('.').at(-1) ?? className;
}

function formatBounds(node: InspectorNode) {
  const { left, top, right, bottom } = node.bounds;
  return `[${left},${top}][${right},${bottom}]`;
}

function DetailRow({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[10px] leading-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1 font-mono text-foreground">
        <span className="wrap-break-word min-w-0">{value || '—'}</span>
        {action}
      </dd>
    </div>
  );
}

export function AndroidInspectorPanel({
  collapsed,
  selectorTargets = [],
  onActivate,
  onCollapse,
  onExpand,
  onUseSelector,
}: AndroidInspectorPanelProps) {
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [deviceListState, setDeviceListState] = useState<DeviceListState>('idle');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [snapshot, setSnapshot] = useState<InspectorSnapshot | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePoint, setImagePoint] = useState<{ x: number; y: number } | null>(null);
  const [candidateNodeIds, setCandidateNodeIds] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectorTargetKey, setSelectorTargetKey] = useState('');
  const [feedback, setFeedback] = useState<'none' | 'resourceId' | 'selector' | 'applied'>('none');
  const selectedDeviceIdRef = useRef('');
  const captureRequestRef = useRef(0);

  const clearInspection = useCallback(() => {
    setImagePoint(null);
    setCandidateNodeIds([]);
    setSelectedNodeId(null);
    setFeedback('none');
  }, []);

  const loadDevices = useCallback(async () => {
    setDeviceListState('loading');
    setError(null);
    if (!window.studioHost) {
      setDevices([]);
      setDeviceListState('error');
      setError('Android Inspector is available only in the desktop app.');
      return;
    }
    try {
      const result = await window.studioHost.androidInspector.listDevices();
      if (!result.ok) {
        setDevices([]);
        setDeviceListState('error');
        setError(result.error.message);
        return;
      }
      setDevices(result.value);
      setDeviceListState('ready');
      const currentDeviceId = selectedDeviceIdRef.current;
      if (currentDeviceId && !result.value.some((device) => device.deviceId === currentDeviceId)) {
        captureRequestRef.current += 1;
        selectedDeviceIdRef.current = '';
        setSelectedDeviceId('');
        setSnapshot(null);
        setCaptureState('idle');
        clearInspection();
      }
    } catch (reason) {
      setDevices([]);
      setDeviceListState('error');
      setError(reason instanceof Error ? reason.message : 'Unable to list Android devices.');
    }
  }, [clearInspection]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadDevices(), 0);
    return () => {
      window.clearTimeout(timeoutId);
      captureRequestRef.current += 1;
    };
  }, [loadDevices]);

  useEffect(() => {
    const nextUrl = snapshot
      ? URL.createObjectURL(
          new Blob([Uint8Array.from(snapshot.screenshot.bytes).buffer], { type: 'image/png' }),
        )
      : null;
    const timeoutId = window.setTimeout(() => setImageUrl(nextUrl), 0);
    return () => {
      window.clearTimeout(timeoutId);
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [snapshot]);

  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) ?? null;
  const candidates = useMemo(() => {
    const nodesById = new Map(snapshot?.nodes.map((node) => [node.nodeId, node]) ?? []);
    return candidateNodeIds.flatMap((nodeId) => {
      const node = nodesById.get(nodeId);
      return node ? [node] : [];
    });
  }, [candidateNodeIds, snapshot]);
  const selectedNode = snapshot?.nodes.find((node) => node.nodeId === selectedNodeId) ?? null;
  const selector = selectedNode ? createAndroidSelectorV1(selectedNode) : null;
  const selectedSelectorTarget =
    selectorTargets.find(
      (target) => `${target.nodeId}:${target.propertyName}` === selectorTargetKey,
    ) ??
    selectorTargets[0] ??
    null;

  const capture = async () => {
    if (!window.studioHost || !selectedDevice?.usable) return;
    const deviceId = selectedDevice.deviceId;
    const requestId = captureRequestRef.current + 1;
    captureRequestRef.current = requestId;
    setCaptureState('capturing');
    setError(null);
    setFeedback('none');
    try {
      const result = await window.studioHost.androidInspector.capture({
        deviceId,
      });
      if (requestId !== captureRequestRef.current || selectedDeviceIdRef.current !== deviceId)
        return;
      if (!result.ok) {
        setCaptureState(snapshot?.deviceId === deviceId ? 'stale' : 'error');
        setError(result.error.message);
        return;
      }
      setSnapshot(result.value);
      setCaptureState('ready');
      clearInspection();
    } catch (reason) {
      if (requestId !== captureRequestRef.current || selectedDeviceIdRef.current !== deviceId)
        return;
      setCaptureState(snapshot?.deviceId === deviceId ? 'stale' : 'error');
      setError(reason instanceof Error ? reason.message : 'Unable to capture Android snapshot.');
    }
  };

  const inspectPoint = (point: { x: number; y: number }) => {
    if (!snapshot) return;
    const matches = getInspectorCandidates(snapshot.nodes, point);
    setImagePoint(point);
    setCandidateNodeIds(matches.map((node) => node.nodeId));
    setSelectedNodeId(matches[0]?.nodeId ?? null);
    setFeedback('none');
  };

  const copyResourceId = async () => {
    if (!selectedNode?.resourceId) return;
    if (await copyText(selectedNode.resourceId)) {
      setFeedback('resourceId');
      setError(null);
    } else {
      setFeedback('none');
      setError('Unable to copy the resource ID to the clipboard.');
    }
  };

  const copySelector = async () => {
    if (!selector) return;
    if (await copyText(JSON.stringify(selector, null, 2))) {
      setFeedback('selector');
      setError(null);
    } else {
      setFeedback('none');
      setError('Unable to copy the Android selector to the clipboard.');
    }
  };

  const useSelectorInNode = () => {
    if (!selector || !selectedSelectorTarget || !onUseSelector) return;
    if (onUseSelector(selectedSelectorTarget, selector)) {
      setFeedback('applied');
      setError(null);
    } else {
      setFeedback('none');
      setError('The Android selector could not be applied to the selected workflow node.');
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        data-android-inspector-panel
        onClick={() => {
          if (onActivate?.() === false) return;
          onExpand();
        }}
        aria-label="Expand Android Inspector"
        title="Expand Android Inspector"
        className="flex h-full w-full flex-col items-center gap-2 bg-panel py-2 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <PanelRightOpen className="size-4 shrink-0" />
      </button>
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-panel"
      aria-label="Android UI inspector"
      data-android-inspector-panel
      onPointerDownCapture={(event) => {
        if (onActivate?.() !== false) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <ScanSearch className="size-3.5" />
        <span className="flex-1">Android Inspector</span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse Android Inspector"
          title="Collapse Android Inspector"
          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="space-y-2">
          <label htmlFor="android-inspector-device" className="text-[10px] font-medium">
            Android device
          </label>
          <div className="flex gap-1.5 text-xs">
            <select
              id="android-inspector-device"
              value={selectedDeviceId}
              onChange={(event) => {
                const deviceId = event.target.value;
                captureRequestRef.current += 1;
                selectedDeviceIdRef.current = deviceId;
                setSelectedDeviceId(deviceId);
                setSnapshot(null);
                setCaptureState('idle');
                setError(null);
                clearInspection();
              }}
              disabled={deviceListState === 'loading'}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[10px] outline-none focus:border-primary"
            >
              <option value="">
                {deviceListState === 'loading' ? 'Loading devices…' : 'Select a device'}
              </option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId} disabled={!device.usable}>
                  {deviceLabel(device)}
                </option>
              ))}
            </select>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void loadDevices()}
              disabled={deviceListState === 'loading'}
              aria-label="Refresh Android devices"
              title="Refresh Android devices"
            >
              <RefreshCw className={deviceListState === 'loading' ? 'animate-spin' : ''} />
            </Button>
          </div>
          {deviceListState === 'ready' && devices.length === 0 ? (
            <p className="text-[10px] leading-4 text-muted-foreground">
              No Android devices found. Connect a device and enable USB debugging.
            </p>
          ) : null}
          {devices.some((device) => device.status === 'unauthorized') ? (
            <p className="text-[10px] leading-4 text-warning">
              Unauthorized device: approve the USB debugging prompt, then refresh.
            </p>
          ) : null}
          {devices.some((device) => device.status === 'offline') ? (
            <p className="text-[10px] leading-4 text-warning">
              Offline device: reconnect it or restart ADB, then refresh.
            </p>
          ) : null}
          <Button
            className="w-full"
            size="sm"
            onClick={() => void capture()}
            disabled={!selectedDevice?.usable || captureState === 'capturing'}
          >
            <Camera />{' '}
            <span className="text-sm">
              {captureState === 'capturing' ? 'Inspecting…' : 'Inspect'}
            </span>
          </Button>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[10px] leading-4 text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {snapshot && imageUrl ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>
                {captureState === 'stale' ? 'Outdated · ' : ''}
                {new Date(snapshot.capturedAt).toLocaleTimeString()}
              </span>
              <span>
                {snapshot.screenshot.width}×{snapshot.screenshot.height}
              </span>
            </div>
            <ScreenshotViewport
              imageUrl={imageUrl}
              snapshot={snapshot}
              selectedNode={selectedNode}
              onSelectPoint={inspectPoint}
            />
            <p className="text-xs leading-4 text-muted-foreground">
              Snapshot is static. Press Inspect to capture the current screen.
            </p>

            {snapshot.warnings.map((warning) => (
              <div
                key={warning}
                className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-[10px] leading-4 text-warning"
              >
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}

            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Elements at selected position</span>
                <span
                  aria-label={`${candidates.length} matching elements`}
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono"
                >
                  {candidates.length}
                </span>
              </div>
              {!imagePoint ? (
                <p className="text-xs leading-4 text-muted-foreground">
                  Click an element in the snapshot.
                </p>
              ) : candidates.length === 0 ? (
                <p className="text-xs leading-4 text-muted-foreground">
                  No inspectable element at ({imagePoint.x}, {imagePoint.y}).
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {candidates.map((candidate, index) => (
                    <button
                      key={candidate.nodeId}
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(candidate.nodeId);
                        setFeedback('none');
                      }}
                      className={`flex w-full items-center gap-4 rounded px-2 py-1.5 text-left text-[10px] transition-colors ${
                        candidate.nodeId === selectedNodeId
                          ? 'bg-primary/15 text-foreground'
                          : 'hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      <span className="font-mono">{index + 1}</span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate text-foreground text-xs">
                          {shortClassName(candidate.className)}
                        </span>
                        <span className="block truncate font-mono text-[10px]">
                          {candidate.resourceId ?? 'No resource ID'}
                        </span>
                      </span>
                      <span className="font-mono text-[10px]">d{candidate.depth}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedNode ? (
              <div className="space-y-2 border-t border-border pt-3 text-xs">
                <dl className="space-y-1.5">
                  <DetailRow label="Package" value={selectedNode.packageName ?? ''} />
                  <DetailRow
                    label="Resource ID"
                    value={selectedNode.resourceId ?? ''}
                    action={
                      selectedNode.resourceId ? (
                        <button
                          type="button"
                          onClick={() => void copyResourceId()}
                          aria-label={
                            feedback === 'resourceId' ? 'Copied resource ID' : 'Copy resource ID'
                          }
                          title={
                            feedback === 'resourceId' ? 'Copied resource ID' : 'Copy resource ID'
                          }
                          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {feedback === 'resourceId' ? (
                            <Check className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      ) : null
                    }
                  />
                  <DetailRow label="Class" value={selectedNode.className} />
                  <DetailRow label="Text" value={selectedNode.text ?? ''} />
                  <DetailRow label="Content desc" value={selectedNode.contentDescription ?? ''} />
                  <DetailRow label="Bounds" value={formatBounds(selectedNode)} />
                  <DetailRow label="Clickable" value={String(selectedNode.clickable)} />
                  <DetailRow label="Enabled" value={String(selectedNode.enabled)} />
                  <DetailRow label="Depth" value={String(selectedNode.depth)} />
                </dl>
                <Button
                  className="w-full"
                  size="sm"
                  variant="secondary"
                  onClick={() => void copySelector()}
                  disabled={!selector}
                >
                  {feedback === 'selector' ? <Check /> : <Copy />}
                  {feedback === 'selector' ? 'Copied selector' : 'Copy selector'}
                </Button>
                {selectorTargets.length > 1 ? (
                  <label className="block text-[10px] text-muted-foreground">
                    Workflow target
                    <select
                      aria-label="Android selector workflow target"
                      value={
                        selectedSelectorTarget
                          ? `${selectedSelectorTarget.nodeId}:${selectedSelectorTarget.propertyName}`
                          : ''
                      }
                      onChange={(event) => setSelectorTargetKey(event.target.value)}
                      className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[10px] text-foreground outline-none focus:border-primary"
                    >
                      {selectorTargets.map((target) => (
                        <option
                          key={`${target.nodeId}:${target.propertyName}`}
                          value={`${target.nodeId}:${target.propertyName}`}
                        >
                          {target.nodeLabel} · {target.propertyTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <Button
                  className="w-full"
                  size="sm"
                  onClick={useSelectorInNode}
                  disabled={!selector || !selectedSelectorTarget || !onUseSelector}
                >
                  {feedback === 'applied' ? <Check /> : null}
                  {feedback === 'applied' ? 'Used in node' : 'Use in node'}
                </Button>
                <p className="text-xs leading-4 text-muted-foreground py-1">
                  {selectedSelectorTarget
                    ? `Target: ${selectedSelectorTarget.nodeLabel} · ${selectedSelectorTarget.propertyTitle}`
                    : 'Select a workflow node with an android-selector-v1 property to enable this action.'}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-editor-canvas/70 p-5 text-center">
            <span className="grid size-12 place-items-center rounded-xl border border-border bg-background text-cyan-400">
              <Smartphone className="size-6" />
            </span>
            <h2 className="mt-4 text-sm font-semibold">Android snapshot</h2>
            <p className="mt-2 max-w-56 text-xs leading-4 text-muted-foreground">
              Select a usable device and press Inspect to capture its current screen.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
