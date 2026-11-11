import type { ProjectDocument } from '@domain/project/project';
import { logicalOutputPortsFor, type NodeDefinition } from '@domain/workflow/node-definition';

export interface WorkflowOutputPortMigrationResult {
  document: ProjectDocument;
  changed: boolean;
  unresolvedEdgeIds: string[];
}

export function migrateLegacyWorkflowOutputPorts(
  document: ProjectDocument,
  catalog: readonly NodeDefinition[],
): WorkflowOutputPortMigrationResult {
  const definitions = new Map(catalog.map((definition) => [definition.type, definition]));
  const unresolvedEdgeIds: string[] = [];
  let changed = false;
  const workflows = Object.fromEntries(
    Object.entries(document.workflows).map(([path, workflow]) => {
      const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
      return [
        path,
        {
          ...workflow,
          edges: workflow.edges.map((edge) => {
            if (edge.sourcePort !== 'out') return edge;
            const source = nodes.get(edge.sourceNodeId);
            const definition = source ? definitions.get(source.type) : undefined;
            const hasSuccess = definition
              ? logicalOutputPortsFor(definition).includes('success')
              : false;
            if (!hasSuccess) {
              unresolvedEdgeIds.push(edge.id);
              return edge;
            }
            changed = true;
            return { ...edge, sourcePort: 'success' };
          }),
        },
      ];
    }),
  );

  return {
    document: changed ? { ...document, workflows } : document,
    changed,
    unresolvedEdgeIds,
  };
}
