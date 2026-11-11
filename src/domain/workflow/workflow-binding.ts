import type { WorkflowBinding } from '@domain/project/project';
import type { JsonValue } from '@shared/types/json-value';

export function isLiteralBinding(
  binding: WorkflowBinding | undefined,
): binding is WorkflowBinding & { value: JsonValue } {
  return (
    (binding?.kind === 'LITERAL' || binding?.kind === 'constant') && Object.hasOwn(binding, 'value')
  );
}

export function literalBinding(value: JsonValue): WorkflowBinding {
  return { kind: 'LITERAL', value: structuredClone(value) };
}
