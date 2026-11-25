import {
  Camera,
  Crosshair,
  Magnet,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

import type { InspectorNode, InspectorSnapshot } from '@domain/android-inspector/android-inspector';
import {
  formatSlotValue,
  readSelectorValue,
  readSlotValue,
  selectorAccepts,
  slotValueToFraction,
  toSlotValue,
  type CoordinateSlot,
  type CoordinateTargetSpec,
  type SelectorTargetSpec,
} from '@domain/android-inspector/coordinate-targets';
import {
  boundsCenter,
  getInspectorCandidates,
  getScreenshotGeometry,
  toImagePoint,
  type InspectorPoint,
} from '@domain/android-inspector/geometry';
import type { WorkflowBinding } from '@domain/project/project';
import type { BindingInputDefinition } from '@domain/workflow/node-definition';
import { Button } from '@presentation/components/ui/button';
import {
  snapshotImageUrl,
  useAndroidCaptureStore,
} from '@presentation/features/android-inspector/android-capture-store';

type SlotValues = Record<string, InspectorPoint | null>;

const SLOT_COLORS = ['var(--g-blue, #1a73e8)', 'var(--g-red, #d93025)', 'var(--g-green, #1e8e3e)'];

function shortClassName(className: string) {
  return className.split('.').at(-1) ?? className;
}

function elementLabel(node: InspectorNode) {
  const name = node.text || node.contentDescription || node.resourceId?.split('/').at(-1);
  return `${shortClassName(node.className)}${name ? ` · “${name}”` : ''}`;
}

/** Markers (and a swipe line) for the slot values, positioned in screen fractions. */
function SlotMarkers({
  spec,
  values,
  snapshot,
  activeKey,
  small = false,
}: {
  spec: CoordinateTargetSpec;
  values: SlotValues;
  snapshot: InspectorSnapshot | null;
  activeKey?: string;
  small?: boolean;
}) {
  const points = spec.slots.map((slot) => {
    const value = values[slot.key];
    return value ? slotValueToFraction(value, spec.unit, snapshot) : null;
  });
  const [first, second] = points;
  const size = small ? 10 : 24;
  return (
    <>
      {first && second ? (
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1={first.x * 100}
            y1={first.y * 100}
            x2={second.x * 100}
            y2={second.y * 100}
            stroke="white"
            vectorEffect="non-scaling-stroke"
            strokeWidth={small ? 3 : 6}
            strokeLinecap="round"
          />
          <line
            x1={first.x * 100}
            y1={first.y * 100}
            x2={second.x * 100}
            y2={second.y * 100}
            stroke="var(--g-blue, #1a73e8)"
            vectorEffect="non-scaling-stroke"
            strokeWidth={small ? 1.5 : 3}
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      {points.map((point, index) =>
        point ? (
          <span
            key={spec.slots[index].key}
            aria-hidden="true"
            className="pointer-events-none absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-white font-semibold text-white shadow-[0_1px_4px_rgb(0_0_0/45%)]"
            style={{
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              width: size,
              height: size,
              borderWidth: small ? 1.5 : 3,
              background: SLOT_COLORS[index],
              fontSize: small ? 0 : 11,
              outline:
                spec.slots[index].key === activeKey ? '3px solid rgb(26 115 232 / 35%)' : undefined,
            }}
          >
            {small ? null : index + 1}
          </span>
        ) : null,
      )}
    </>
  );
}

/** Large screen view: hover shows the element and position, click sets the active slot. */
function PickerViewport({
  snapshot,
  imageUrl,
  spec,
  values,
  activeKey,
  snap,
  elementMode = false,
  chosen = null,
  onPick,
}: {
  snapshot: InspectorSnapshot;
  imageUrl: string;
  spec: CoordinateTargetSpec;
  values: SlotValues;
  activeKey: string;
  snap: boolean;
  /** Selector mode: pick whole elements, no coordinates. */
  elementMode?: boolean;
  chosen?: InspectorNode | null;
  onPick(imagePoint: InspectorPoint, element: InspectorNode | null): void;
}) {
  const [hover, setHover] = useState<{
    point: InspectorPoint;
    element: InspectorNode | null;
  } | null>(null);
  const { width, height } = snapshot.screenshot;

  const locate = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const geometry = getScreenshotGeometry(width, height, bounds.width, bounds.height);
    if (!geometry) return null;
    const point = toImagePoint(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      geometry,
    );
    if (!point) return null;
    const element = getInspectorCandidates(snapshot.nodes, point)[0] ?? null;
    return { point, element };
  };

  const effectivePoint = (located: { point: InspectorPoint; element: InspectorNode | null }) =>
    snap && located.element ? boundsCenter(located.element.bounds) : located.point;

  const boxOf = (node: InspectorNode) => ({
    left: `${(node.bounds.left / width) * 100}%`,
    top: `${(node.bounds.top / height) * 100}%`,
    width: `${((node.bounds.right - node.bounds.left) / width) * 100}%`,
    height: `${((node.bounds.bottom - node.bounds.top) / height) * 100}%`,
  });
  const highlight = hover?.element ? boxOf(hover.element) : null;
  const hoverValue =
    hover && !elementMode && spec.slots.length > 0
      ? toSlotValue(
          effectivePoint(hover),
          snapshot,
          spec.unit,
          spec.slots.find((slot) => slot.key === activeKey) ?? spec.slots[0],
          {},
        )
      : null;
  const crosshair = hover && !elementMode ? effectivePoint(hover) : null;
  const hoverText = elementMode
    ? hover?.element
      ? (hover.element.resourceId ?? 'No resource ID')
      : null
    : hoverValue
      ? formatSlotValue(hoverValue, spec.unit)
      : null;

  return (
    <div
      className="relative mx-auto h-full max-h-full cursor-crosshair overflow-hidden rounded-xl border border-border bg-black shadow-sm"
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerMove={(event) => setHover(locate(event))}
      onPointerLeave={() => setHover(null)}
      onClick={(event) => {
        const located = locate(event as unknown as PointerEvent<HTMLDivElement>);
        if (located) onPick(effectivePoint(located), located.element);
      }}
      role="application"
      aria-label="Device screen. Click to set the coordinate."
    >
      <img
        src={imageUrl}
        alt={`Screen of ${snapshot.deviceId}`}
        draggable={false}
        className="absolute inset-0 size-full select-none object-contain"
      />
      {highlight ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm border-2 border-[var(--g-blue,#1a73e8)] bg-[rgb(26_115_232/12%)]"
          style={highlight}
        />
      ) : null}
      {chosen ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm border-[3px] border-[var(--g-green,#1e8e3e)] bg-[rgb(30_142_62/14%)]"
          style={boxOf(chosen)}
        />
      ) : null}
      {crosshair ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-white/70 mix-blend-difference"
            style={{ left: `${(crosshair.x / width) * 100}%` }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px bg-white/70 mix-blend-difference"
            style={{ top: `${(crosshair.y / height) * 100}%` }}
          />
        </>
      ) : null}
      <SlotMarkers spec={spec} values={values} snapshot={snapshot} activeKey={activeKey} />
      {hover && hoverText ? (
        <span
          className="pointer-events-none absolute rounded-md bg-[#1f1f1f]/85 px-2 py-1 font-mono text-[11px] text-white shadow"
          style={{
            left: `min(calc(${(hover.point.x / width) * 100}% + 14px), calc(100% - 150px))`,
            top: `max(calc(${(hover.point.y / height) * 100}% - 34px), 6px)`,
          }}
        >
          {hoverText}
        </span>
      ) : null}
    </div>
  );
}

interface CoordinatePickerDialogProps {
  nodeLabel: string;
  spec: CoordinateTargetSpec;
  initial: SlotValues;
  bindingInputs: Record<string, BindingInputDefinition>;
  /** Selector mode (SELECTOR_ID): click an element, its resource id is used. */
  selector?: SelectorTargetSpec;
  selectorValue?: string | null;
  onApply(values: SlotValues): void;
  onApplySelector?(resourceId: string): void;
  onClose(): void;
}

export function CoordinatePickerDialog({
  nodeLabel,
  spec,
  initial,
  bindingInputs,
  selector,
  selectorValue = null,
  onApply,
  onApplySelector,
  onClose,
}: CoordinatePickerDialogProps) {
  const devices = useAndroidCaptureStore((state) => state.devices);
  const listState = useAndroidCaptureStore((state) => state.listState);
  const deviceId = useAndroidCaptureStore((state) => state.deviceId);
  const snapshot = useAndroidCaptureStore((state) => state.snapshot);
  const capturing = useAndroidCaptureStore((state) => state.capturing);
  const error = useAndroidCaptureStore((state) => state.error);
  const { loadDevices, selectDevice, capture } = useAndroidCaptureStore.getState();

  const [values, setValues] = useState<SlotValues>(initial);
  const [activeKey, setActiveKey] = useState(
    spec.slots.find((slot) => !initial[slot.key])?.key ?? spec.slots[0]?.key ?? '',
  );
  const [chosen, setChosen] = useState<InspectorNode | null>(null);
  const [snap, setSnap] = useState(false);
  const [lastElement, setLastElement] = useState<InspectorNode | null>(null);
  const autoCaptured = useRef(false);
  const imageUrl = snapshotImageUrl(snapshot);

  // Open straight into a usable screen: list devices, then capture once if nothing is loaded.
  useEffect(() => {
    void (async () => {
      await loadDevices();
      const state = useAndroidCaptureStore.getState();
      if (!autoCaptured.current && state.deviceId && !state.snapshot) {
        autoCaptured.current = true;
        await capture();
      }
    })();
  }, [capture, loadDevices]);

  const selectorOk = selector ? selectorAccepts(selector, chosen?.resourceId) : false;
  const complete = selector ? selectorOk : spec.slots.every((slot) => values[slot.key]);
  const apply = () => {
    if (!complete) return;
    if (selector && chosen?.resourceId) onApplySelector?.(chosen.resourceId);
    else onApply(values);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Enter' && complete) {
        event.preventDefault();
        if (selector && chosen?.resourceId) onApplySelector?.(chosen.resourceId);
        else onApply(values);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [chosen, complete, onApply, onApplySelector, onClose, selector, values]);

  const pick = (imagePoint: InspectorPoint, element: InspectorNode | null) => {
    if (!snapshot) return;
    if (selector) {
      setChosen(element);
      return;
    }
    const slot = spec.slots.find((entry) => entry.key === activeKey) ?? spec.slots[0];
    const value = toSlotValue(imagePoint, snapshot, spec.unit, slot, bindingInputs);
    setValues((current) => ({ ...current, [slot.key]: value }));
    setLastElement(element);
    // Swipe: after the start point, move straight on to the end point.
    const index = spec.slots.indexOf(slot);
    const next = spec.slots[index + 1];
    if (next && !values[next.key]) setActiveKey(next.key);
  };

  const usableDevices = devices.filter((device) => device.usable);
  const unitLabel = spec.unit === 'percent' ? '% of screen' : 'device pixels';

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-5"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="coordinate-picker-title"
        className="flex h-[min(92vh,960px)] w-[min(96vw,1240px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="grid size-8 place-items-center rounded-lg bg-[rgb(26_115_232/10%)] text-[var(--g-blue,#1a73e8)]">
            <Crosshair className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="coordinate-picker-title" className="text-sm font-semibold">
              {selector ? 'Pick element' : 'Pick coordinates'} · {nodeLabel}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selector
                ? 'Click an element on the device screen. Its resource ID is used as the selector.'
                : `Click on the device screen. Values are saved in ${unitLabel}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close coordinate picker"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 items-center justify-center bg-[#f5f5f5] p-5">
            {snapshot && imageUrl ? (
              <PickerViewport
                snapshot={snapshot}
                imageUrl={imageUrl}
                spec={spec}
                values={values}
                activeKey={activeKey}
                snap={snap}
                elementMode={Boolean(selector)}
                chosen={selector ? chosen : null}
                onPick={pick}
              />
            ) : (
              <div className="flex max-w-sm flex-col items-center text-center">
                <span className="grid size-14 place-items-center rounded-2xl border border-border bg-card text-muted-foreground">
                  {capturing || listState === 'loading' ? (
                    <RefreshCw className="size-6 animate-spin" />
                  ) : (
                    <Smartphone className="size-6" />
                  )}
                </span>
                <p className="mt-4 text-sm font-medium">
                  {capturing
                    ? 'Capturing the device screen…'
                    : listState === 'loading'
                      ? 'Looking for devices…'
                      : usableDevices.length === 0
                        ? 'No usable Android device'
                        : 'Choose a device and capture its screen'}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {usableDevices.length === 0 && listState !== 'loading'
                    ? 'Start an emulator (LDPlayer) or connect a phone with USB debugging, then refresh.'
                    : 'The screen is captured once; recapture after the app on the device changes.'}
                </p>
              </div>
            )}
          </div>

          <aside className="flex w-80 shrink-0 flex-col border-l border-border">
            <div className="space-y-2 border-b border-border p-4">
              <label htmlFor="coordinate-picker-device" className="text-xs font-medium">
                Device
              </label>
              <div className="flex gap-1.5">
                <select
                  id="coordinate-picker-device"
                  value={deviceId}
                  onChange={(event) => selectDevice(event.target.value)}
                  disabled={listState === 'loading'}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                >
                  <option value="">
                    {listState === 'loading' ? 'Loading devices…' : 'Select a device'}
                  </option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId} disabled={!device.usable}>
                      {(device.model ?? 'Android device') + ' — ' + device.deviceId}
                      {device.usable ? '' : ` (${device.status})`}
                    </option>
                  ))}
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void loadDevices()}
                  disabled={listState === 'loading'}
                  aria-label="Refresh devices"
                  title="Refresh devices"
                >
                  <RefreshCw className={listState === 'loading' ? 'animate-spin' : ''} />
                </Button>
              </div>
              <Button
                className="w-full"
                variant={snapshot ? 'secondary' : 'default'}
                size="sm"
                onClick={() => void capture()}
                disabled={!deviceId || capturing}
              >
                <Camera />
                {capturing ? 'Capturing…' : snapshot ? 'Recapture screen' : 'Capture screen'}
              </Button>
              {snapshot ? (
                <p className="text-[11px] text-muted-foreground">
                  Captured {new Date(snapshot.capturedAt).toLocaleTimeString()} ·{' '}
                  {snapshot.screenshot.width}×{snapshot.screenshot.height}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-[11px] leading-4 text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {selector ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium">Selector</div>
                  {chosen ? (
                    <div
                      className={
                        'rounded-lg border px-3 py-2.5 text-[11px] leading-4 ' +
                        (selectorOk
                          ? 'border-[var(--g-green,#1e8e3e)] bg-[rgb(30_142_62/6%)]'
                          : 'border-destructive/40 bg-destructive/5')
                      }
                    >
                      <div className="truncate font-medium">{elementLabel(chosen)}</div>
                      <div className="mt-1 break-all font-mono">
                        {chosen.resourceId ?? 'No resource ID'}
                      </div>
                      {!selectorOk ? (
                        <p className="mt-1.5 text-destructive">
                          {chosen.resourceId
                            ? 'This resource ID does not match the selector format (package:id/name).'
                            : 'This element has no resource ID. Pick its parent or a nearby element, or switch the node to coordinates.'}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-secondary px-3 py-2.5 text-[11px] leading-4 text-muted-foreground">
                      {selector.field} ={' '}
                      <span className="font-mono">{selectorValue ?? 'Not set'}</span>
                      <br />
                      Hover the screen to see each element&apos;s resource ID, then click one.
                    </p>
                  )}
                </div>
              ) : null}
              <div className={selector ? 'hidden' : 'space-y-1.5'}>
                {spec.slots.map((slot: CoordinateSlot, index) => (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => setActiveKey(slot.key)}
                    aria-pressed={slot.key === activeKey}
                    className={
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ' +
                      (slot.key === activeKey
                        ? 'border-[var(--g-blue,#1a73e8)] bg-[rgb(26_115_232/6%)]'
                        : 'border-border hover:bg-secondary')
                    }
                  >
                    <span
                      className="grid size-6 place-items-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: SLOT_COLORS[index] }}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">
                        {spec.slots.length === 1 ? 'Position' : slot.label}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {slot.xField}, {slot.yField} ={' '}
                        {formatSlotValue(values[slot.key], spec.unit)}
                      </span>
                    </span>
                    {slot.key === activeKey ? (
                      <MousePointerClick className="size-4 text-[var(--g-blue,#1a73e8)]" />
                    ) : null}
                  </button>
                ))}
              </div>

              <label
                className={
                  selector
                    ? 'hidden'
                    : 'flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5'
                }
              >
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(event) => setSnap(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Magnet className="size-3.5" /> Snap to element center
                  </span>
                  <span className="block text-[11px] leading-4 text-muted-foreground">
                    Uses the middle of the element under the pointer instead of the exact point.
                  </span>
                </span>
              </label>

              {lastElement && !selector ? (
                <div className="rounded-lg bg-secondary px-3 py-2.5 text-[11px] leading-4">
                  <div className="font-medium">Picked element</div>
                  <div className="truncate text-muted-foreground">{elementLabel(lastElement)}</div>
                  {lastElement.resourceId ? (
                    <div className="truncate font-mono text-muted-foreground">
                      {lastElement.resourceId}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={apply} disabled={!complete}>
                {selector
                  ? 'Use this element'
                  : `Use ${spec.slots.length === 1 ? 'this point' : 'these points'}`}
              </Button>
            </footer>
          </aside>
        </div>
      </section>
    </div>
  );
}

/** Inline card in the node form: current values on the last screen, and the way into the picker. */
export function CoordinateTargetCard({
  nodeLabel,
  spec,
  bindings,
  bindingInputs,
  onApply,
}: {
  nodeLabel: string;
  spec: CoordinateTargetSpec;
  bindings: Record<string, WorkflowBinding>;
  bindingInputs: Record<string, BindingInputDefinition>;
  onApply(values: SlotValues): void;
}) {
  const [open, setOpen] = useState(false);
  const snapshot = useAndroidCaptureStore((state) => state.snapshot);
  const imageUrl = snapshotImageUrl(snapshot);
  const values = useMemo(
    () => Object.fromEntries(spec.slots.map((slot) => [slot.key, readSlotValue(slot, bindings)])),
    [bindings, spec.slots],
  ) as SlotValues;
  const anySet = spec.slots.some((slot) => values[slot.key]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-2.5">
      {snapshot && imageUrl && anySet ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative w-9 shrink-0 overflow-hidden rounded border border-border bg-black"
          style={{ aspectRatio: `${snapshot.screenshot.width} / ${snapshot.screenshot.height}` }}
          aria-label="Open coordinate picker"
        >
          <img src={imageUrl} alt="" className="absolute inset-0 size-full object-contain" />
          <SlotMarkers spec={spec} values={values} snapshot={snapshot} small />
        </button>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-card text-[var(--g-blue,#1a73e8)]">
          <Crosshair className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1 text-xs">
        <div className="font-medium">{anySet ? 'Picked on device' : 'Pick on device'}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {anySet
            ? spec.slots
                .map(
                  (slot) =>
                    (spec.slots.length > 1 ? `${slot.label} ` : '') +
                    formatSlotValue(values[slot.key], spec.unit),
                )
                .join(' → ')
            : 'Click on the emulator screen'}
        </div>
      </div>
      <Button
        size="sm"
        variant={anySet ? 'secondary' : 'default'}
        className="h-8 shrink-0"
        onClick={() => setOpen(true)}
      >
        <Crosshair /> {anySet ? 'Re-pick' : 'Pick'}
      </Button>
      {open
        ? // Portal: the node drawer is transformed, which would trap a fixed-position dialog.
          createPortal(
            <CoordinatePickerDialog
              nodeLabel={nodeLabel}
              spec={spec}
              initial={values}
              bindingInputs={bindingInputs}
              onApply={(next) => {
                onApply(next);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

/** Inline card for SELECTOR_ID mode: current resource id and the way into the element picker. */
export function SelectorTargetCard({
  nodeLabel,
  spec,
  bindings,
  bindingInputs,
  onApply,
}: {
  nodeLabel: string;
  spec: SelectorTargetSpec;
  bindings: Record<string, WorkflowBinding>;
  bindingInputs: Record<string, BindingInputDefinition>;
  onApply(resourceId: string): void;
}) {
  const [open, setOpen] = useState(false);
  const current = readSelectorValue(spec, bindings);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-card text-[var(--g-blue,#1a73e8)]">
        <MousePointerClick className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <div className="font-medium">{current ? 'Element picked' : 'Pick element on device'}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {current ?? 'Its resource ID becomes the selector'}
        </div>
      </div>
      <Button
        size="sm"
        variant={current ? 'secondary' : 'default'}
        className="h-8 shrink-0"
        onClick={() => setOpen(true)}
      >
        <MousePointerClick /> {current ? 'Re-pick' : 'Pick'}
      </Button>
      {open
        ? createPortal(
            <CoordinatePickerDialog
              nodeLabel={nodeLabel}
              spec={{ unit: 'px', slots: [] }}
              initial={{}}
              bindingInputs={bindingInputs}
              selector={spec}
              selectorValue={current}
              onApply={() => undefined}
              onApplySelector={(resourceId) => {
                onApply(resourceId);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
