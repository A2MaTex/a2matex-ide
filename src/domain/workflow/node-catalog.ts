import type { NodeDefinition } from '@domain/workflow/node-definition';
import { literalBinding } from '@domain/workflow/workflow-binding';
import type { WorkflowBinding } from '@domain/project/project';
import type { JsonValue } from '@shared/types/json-value';

export function findNodeDefinition(
  type: string,
  version: number,
  catalog: readonly NodeDefinition[],
) {
  return catalog.find((definition) => definition.type === type && definition.version === version);
}

export function defaultNodeValuesFor(definition: NodeDefinition): {
  bindings: Record<string, WorkflowBinding>;
  config: Record<string, JsonValue>;
} {
  const bindings: Record<string, WorkflowBinding> = {};
  const config: Record<string, JsonValue> = {};
  for (const [name, property] of Object.entries(definition.properties.properties)) {
    if (property.default === undefined) continue;
    if (property.storage === 'config') config[name] = structuredClone(property.default);
    else bindings[name] = literalBinding(property.default);
  }
  return { bindings, config };
}
