import type { WorkflowDocument } from '@domain/project/project';
import type { BindingInputDefinition, NodeDefinition } from '@domain/workflow/node-definition';
import type { FieldValueSchema } from '@domain/schema/object-value-schema';

function reachable(
  workflow: WorkflowDocument,
  from: string,
  to: string,
  excludedEdgeIds: ReadonlySet<string> = new Set(),
) {
  const pending = [from];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (nodeId === to) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const edge of workflow.edges) {
      if (edge.sourceNodeId === nodeId && !excludedEdgeIds.has(edge.id)) {
        pending.push(edge.targetNodeId);
      }
    }
  }
  return false;
}

export function producerDominatesConsumer(
  workflow: WorkflowDocument,
  producerId: string,
  consumerId: string,
) {
  if (producerId === consumerId || !workflow.entryNodeId) return false;
  const successEdges = workflow.edges.filter(
    (edge) => edge.sourceNodeId === producerId && edge.sourcePort === 'success',
  );
  if (
    successEdges.length === 0 ||
    !reachable(workflow, workflow.entryNodeId, producerId) ||
    !successEdges.some((edge) => reachable(workflow, edge.targetNodeId, consumerId))
  ) {
    return false;
  }
  return !reachable(
    workflow,
    workflow.entryNodeId,
    consumerId,
    new Set(successEdges.map(({ id }) => id)),
  );
}

function compatibleField(input: BindingInputDefinition, output: FieldValueSchema) {
  if (input.valueSchema) return input.valueSchema.type === output.type;
  const types = input.bindingKinds.NODE_OUTPUT?.literalTypes;
  if (!types || types.length === 0)
    return ['string', 'number', 'integer', 'boolean'].includes(output.type);
  const outputType = output.type === 'integer' ? 'number' : output.type;
  return types.includes(outputType as 'string' | 'number' | 'boolean');
}

export function nodeOutputOptions(
  workflow: WorkflowDocument,
  consumerId: string,
  input: BindingInputDefinition,
  catalog: readonly NodeDefinition[],
) {
  return workflow.nodes.flatMap((node) => {
    if (!producerDominatesConsumer(workflow, node.id, consumerId)) return [];
    const definition = catalog.find(({ type }) => type === node.type);
    if (!definition?.outputSchema) return [];
    return definition.outputSchema.required.flatMap((field) => {
      const schema = definition.outputSchema!.properties[field];
      return schema && compatibleField(input, schema)
        ? [
            {
              nodeId: node.id,
              nodeLabel: node.editor.name?.trim() || definition.displayName,
              field,
            },
          ]
        : [];
    });
  });
}

export function variableSuggestions(
  workflow: WorkflowDocument,
  consumerId: string,
  scope: 'FLOW' | 'RUN_GROUP',
) {
  return [
    ...new Set(
      workflow.nodes.flatMap((node) => {
        if (node.type !== 'flow.set_variable' || node.config.scope !== scope) return [];
        if (scope === 'FLOW' && !producerDominatesConsumer(workflow, node.id, consumerId))
          return [];
        return typeof node.config.name === 'string' ? [node.config.name] : [];
      }),
    ),
  ].sort();
}
