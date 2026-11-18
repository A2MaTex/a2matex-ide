import type { WorkflowDocument } from '@domain/project/project';
import type { JsonValue } from '@shared/types/json-value';

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The only serializer allowed at the Runtime/Cloud shared Editor Graph boundary. */
export function toRuntimeEditorGraph(workflow: WorkflowDocument): Record<string, JsonValue> {
  return {
    schemaVersion: workflow.schemaVersion,
    entryNodeId: workflow.entryNodeId,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      config: cloneJson(node.config),
      bindings: cloneJson(node.bindings),
      errorPolicy: node.errorPolicy,
      editor: cloneJson(node.editor),
      ...(node.timeoutMs === undefined ? {} : { timeoutMs: node.timeoutMs }),
      ...(node.retryPolicy === undefined ? {} : { retryPolicy: cloneJson(node.retryPolicy) }),
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
    })),
  } as Record<string, JsonValue>;
}
