import type { InspectorNode } from '@domain/android-inspector/android-inspector';
import type { WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import type { JsonValue } from '@shared/types/json-value';

export const ANDROID_SELECTOR_V1_FORMAT = 'android-selector-v1';

export interface AndroidSelectorV1 {
  schemaVersion: 1;
  strategy: 'resourceId';
  value: string;
  packageName?: string;
}

export interface AndroidSelectorTarget {
  nodeId: string;
  nodeLabel: string;
  propertyName: string;
  propertyTitle: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isAndroidSelectorV1(value: unknown): value is AndroidSelectorV1 {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) => ['schemaVersion', 'strategy', 'value', 'packageName'].includes(key)) &&
    value.schemaVersion === 1 &&
    value.strategy === 'resourceId' &&
    typeof value.value === 'string' &&
    value.value.trim().length > 0 &&
    (value.packageName === undefined ||
      (typeof value.packageName === 'string' && value.packageName.trim().length > 0))
  );
}

export function createAndroidSelectorV1(
  node: Pick<InspectorNode, 'packageName' | 'resourceId'>,
): AndroidSelectorV1 | null {
  const value = node.resourceId;
  if (!value?.trim()) return null;
  const packageName = node.packageName;
  return {
    schemaVersion: 1,
    strategy: 'resourceId',
    value,
    ...(packageName?.trim() ? { packageName } : {}),
  };
}

export function androidSelectorToJsonValue(selector: AndroidSelectorV1): JsonValue {
  return { ...selector };
}

export function getAndroidSelectorTargets(
  node: WorkflowNode | null,
  definition: NodeDefinition | undefined,
): AndroidSelectorTarget[] {
  if (!node || !definition || node.type !== definition.type) return [];
  return Object.entries(definition.properties.properties).flatMap(([propertyName, property]) =>
    property.type === 'object' && property.format === ANDROID_SELECTOR_V1_FORMAT
      ? [
          {
            nodeId: node.id,
            nodeLabel: definition.displayName,
            propertyName,
            propertyTitle: property.title,
          },
        ]
      : [],
  );
}
