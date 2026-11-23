import { bindingInputsFor, type NodeDefinition } from '@domain/workflow/node-definition';
import {
  defaultBindingFor,
  firstBindingKind,
  literalBinding,
} from '@domain/workflow/workflow-binding';
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
  for (const [name, property] of Object.entries(definition.configSchema?.properties ?? {})) {
    if (property.default !== undefined && !Object.hasOwn(config, name)) {
      config[name] = structuredClone(property.default);
    }
  }
  if (definition.targeting && typeof config.targetMode !== 'string') {
    const initialMode = definition.targeting.modes[0]?.mode;
    if (initialMode) config.targetMode = initialMode;
  }
  for (const [name, input] of Object.entries(bindingInputsFor(definition, config))) {
    if (Object.hasOwn(bindings, name)) continue;
    if (input.valueSchema?.default !== undefined && input.bindingKinds.LITERAL) {
      bindings[name] = literalBinding(input.valueSchema.default);
      continue;
    }
    const kind = input.required ? firstBindingKind(input) : undefined;
    if (kind) bindings[name] = defaultBindingFor(input, kind);
  }
  if (definition.switch && !Array.isArray(config.rules)) {
    const operator = definition.switch.operators[0];
    if (operator) {
      const id = globalThis.crypto.randomUUID();
      config.rules = [{ id, operator: operator.value }];
      const kind = Object.keys(definition.switch.operand.bindingKinds)[0] as
        | 'LITERAL'
        | 'WORKFLOW_INPUT'
        | 'NODE_OUTPUT'
        | 'FLOW_VARIABLE'
        | 'GLOBAL_VARIABLE'
        | undefined;
      if (operator.operandCount === 1 && kind) {
        bindings[id] = defaultBindingFor(definition.switch.operand, kind);
      }
    }
  }
  return { bindings, config };
}
