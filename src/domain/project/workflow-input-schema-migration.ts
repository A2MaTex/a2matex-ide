import type { ProjectDocument, WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import {
  emptyObjectValueSchema,
  objectValueSchemasEqual,
  type ObjectValueSchema,
} from '@domain/schema/object-value-schema';

export interface WorkflowInputSchemaMigrationResult {
  document: ProjectDocument;
  changed: boolean;
  unresolvedNodeIds: string[];
}

function schemaFor(node: WorkflowNode, definition: NodeDefinition): ObjectValueSchema | undefined {
  if (!definition.targeting) {
    return definition.instanceInputSchema ?? emptyObjectValueSchema();
  }
  const targetMode = node.config.targetMode;
  if (typeof targetMode !== 'string') return undefined;
  return definition.targeting.modes.find(({ mode }) => mode === targetMode)?.bindingSchema;
}

function isEmptySchema(schema: ObjectValueSchema) {
  return Object.keys(schema.properties).length === 0 && schema.required.length === 0;
}

export function migrateWorkflowNodeInputSchemas(
  document: ProjectDocument,
  catalog: readonly NodeDefinition[],
): WorkflowInputSchemaMigrationResult {
  const definitions = new Map(catalog.map((definition) => [definition.type, definition]));
  const unresolvedNodeIds: string[] = [];
  let changed = false;
  const workflows = Object.fromEntries(
    Object.entries(document.workflows).map(([path, workflow]) => [
      path,
      {
        ...workflow,
        nodes: workflow.nodes.map((node) => {
          if (!isEmptySchema(node.inputSchema)) return node;
          const definition = definitions.get(node.type);
          if (!definition) {
            unresolvedNodeIds.push(node.id);
            return node;
          }
          const inputSchema = schemaFor(node, definition);
          if (!inputSchema) {
            unresolvedNodeIds.push(node.id);
            return node;
          }
          if (objectValueSchemasEqual(node.inputSchema, inputSchema)) return node;
          changed = true;
          return { ...node, inputSchema: structuredClone(inputSchema) };
        }),
      },
    ]),
  );
  return {
    document: changed ? { ...document, workflows } : document,
    changed,
    unresolvedNodeIds,
  };
}
