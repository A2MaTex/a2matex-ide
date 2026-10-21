import type { JsonValue } from '../../shared/types/json-value.js';
import type { NodeDefinition } from './node-definition.js';

export function findNodeDefinition(
  type: string,
  version: number,
  catalog: readonly NodeDefinition[],
) {
  return catalog.find((definition) => definition.type === type && definition.version === version);
}

export function defaultParamsFor(definition: NodeDefinition): Record<string, JsonValue> {
  const params: Record<string, JsonValue> = {};
  for (const [name, property] of Object.entries(definition.properties.properties)) {
    if (property.default !== undefined) {
      params[name] = structuredClone(property.default);
    }
  }
  return params;
}
