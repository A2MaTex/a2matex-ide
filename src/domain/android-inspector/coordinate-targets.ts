import type { InspectorSnapshot } from '@domain/android-inspector/android-inspector';
import type { InspectorPoint } from '@domain/android-inspector/geometry';
import type { BindingInputDefinition } from '@domain/workflow/node-definition';
import type { WorkflowBinding } from '@domain/project/project';

export type CoordinateUnit = 'px' | 'percent';

/** One point a coordinate-targeting node needs (a tap point, or the start / end of a swipe). */
export interface CoordinateSlot {
  key: string;
  label: string;
  xField: string;
  yField: string;
}

export interface CoordinateTargetSpec {
  unit: CoordinateUnit;
  slots: CoordinateSlot[];
}

const SLOT_SHAPES: Array<{ key: string; label: string; x: string; y: string }> = [
  { key: 'point', label: 'Point', x: 'x', y: 'y' },
  { key: 'start', label: 'Start', x: 'startX', y: 'startY' },
  { key: 'end', label: 'End', x: 'endX', y: 'endY' },
];

/**
 * Coordinate modes the picker can fill: ABSOLUTE_PIXELS (x / startX …) and SCREEN_PERCENT
 * (xPercent / startXPercent …). Returns null for any other mode (selector, full screen …).
 */
export function coordinateTargetSpec(
  targetMode: unknown,
  bindingInputs: Record<string, BindingInputDefinition>,
): CoordinateTargetSpec | null {
  if (targetMode !== 'ABSOLUTE_PIXELS' && targetMode !== 'SCREEN_PERCENT') return null;
  const unit: CoordinateUnit = targetMode === 'SCREEN_PERCENT' ? 'percent' : 'px';
  const suffix = unit === 'percent' ? 'Percent' : '';
  const slots = SLOT_SHAPES.flatMap((shape) => {
    const xField = `${shape.x}${suffix}`;
    const yField = `${shape.y}${suffix}`;
    return bindingInputs[xField] && bindingInputs[yField]
      ? [{ key: shape.key, label: shape.label, xField, yField }]
      : [];
  });
  return slots.length > 0 ? { unit, slots } : null;
}

function literalNumber(binding: WorkflowBinding | undefined): number | null {
  if (!binding || binding.kind !== 'LITERAL') return null;
  const value = (binding as { value?: unknown }).value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Current literal value of a slot, in the node's own unit; null when not a literal pair. */
export function readSlotValue(
  slot: CoordinateSlot,
  bindings: Record<string, WorkflowBinding | undefined>,
): InspectorPoint | null {
  const x = literalNumber(bindings[slot.xField]);
  const y = literalNumber(bindings[slot.yField]);
  return x === null || y === null ? null : { x, y };
}

/** Device size in the coordinate space `adb shell input` uses. */
export function deviceSize(snapshot: InspectorSnapshot) {
  return {
    width: snapshot.screen.width ?? snapshot.screenshot.width,
    height: snapshot.screen.height ?? snapshot.screenshot.height,
  };
}

function roundFor(input: BindingInputDefinition | undefined, value: number) {
  const integer = input?.valueSchema?.type === 'integer';
  return integer ? Math.round(value) : Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Screenshot pixel → value stored on the node (device pixels or percent of the screen). */
export function toSlotValue(
  imagePoint: InspectorPoint,
  snapshot: InspectorSnapshot,
  unit: CoordinateUnit,
  slot: CoordinateSlot,
  bindingInputs: Record<string, BindingInputDefinition>,
): InspectorPoint {
  const { width: imageWidth, height: imageHeight } = snapshot.screenshot;
  if (unit === 'percent') {
    return {
      x: clamp(roundFor(bindingInputs[slot.xField], (imagePoint.x / imageWidth) * 100), 0, 100),
      y: clamp(roundFor(bindingInputs[slot.yField], (imagePoint.y / imageHeight) * 100), 0, 100),
    };
  }
  const device = deviceSize(snapshot);
  return {
    x: clamp(Math.round((imagePoint.x * device.width) / imageWidth), 0, device.width - 1),
    y: clamp(Math.round((imagePoint.y * device.height) / imageHeight), 0, device.height - 1),
  };
}

/** Stored value → fraction of the screen (0–1), for drawing markers on any screenshot. */
export function slotValueToFraction(
  value: InspectorPoint,
  unit: CoordinateUnit,
  snapshot: InspectorSnapshot | null,
): InspectorPoint | null {
  if (unit === 'percent') return { x: value.x / 100, y: value.y / 100 };
  if (!snapshot) return null;
  const device = deviceSize(snapshot);
  return { x: value.x / device.width, y: value.y / device.height };
}

export function formatSlotValue(value: InspectorPoint | null, unit: CoordinateUnit) {
  if (!value) return 'Not set';
  return unit === 'percent' ? `${value.x}%, ${value.y}%` : `${value.x}, ${value.y}`;
}

export interface SelectorTargetSpec {
  field: string;
  pattern?: string;
}

export interface PackageTargetSpec {
  field: string;
  pattern?: string;
}

/** SELECTOR_ID mode: the string field that takes an element resource id (pkg:id/name). */
export function selectorTargetSpec(
  targetMode: unknown,
  bindingInputs: Record<string, BindingInputDefinition>,
): SelectorTargetSpec | null {
  if (targetMode !== 'SELECTOR_ID') return null;
  const field = Object.keys(bindingInputs).find((name) => /^selector(_id|Id)?$/.test(name));
  if (!field) return null;
  const schema = bindingInputs[field].valueSchema;
  if (schema && schema.type !== 'string') return null;
  return { field, pattern: schema?.type === 'string' ? schema.pattern : undefined };
}

export function readSelectorValue(
  spec: SelectorTargetSpec,
  bindings: Record<string, WorkflowBinding | undefined>,
): string | null {
  const binding = bindings[spec.field];
  if (!binding || binding.kind !== 'LITERAL') return null;
  const value = (binding as { value?: unknown }).value;
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Launch App: packageName can be copied from any inspected element in the foreground app. */
export function packageTargetSpec(
  nodeType: string,
  bindingInputs: Record<string, BindingInputDefinition>,
): PackageTargetSpec | null {
  if (nodeType !== 'android.launch_app') return null;
  const input = bindingInputs.packageName;
  if (!input || (input.valueSchema && input.valueSchema.type !== 'string')) return null;
  return {
    field: 'packageName',
    pattern: input.valueSchema?.type === 'string' ? input.valueSchema.pattern : undefined,
  };
}

export function readPackageValue(
  spec: PackageTargetSpec,
  bindings: Record<string, WorkflowBinding | undefined>,
) {
  return readSelectorValue(spec, bindings);
}

export function selectorAccepts(spec: SelectorTargetSpec, resourceId: string | undefined) {
  if (!resourceId?.trim()) return false;
  if (!spec.pattern) return true;
  try {
    return new RegExp(spec.pattern).test(resourceId);
  } catch {
    return true;
  }
}

export function packageAccepts(spec: PackageTargetSpec, packageName: string | undefined) {
  return selectorAccepts(spec, packageName);
}
