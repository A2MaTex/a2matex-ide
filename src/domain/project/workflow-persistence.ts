import { z } from 'zod';

import { migrateLegacyWorkflow } from '@domain/project/legacy-workflow-migration';
import type { WorkflowDocument } from '@domain/project/project';
import {
  workflowDocumentSchema,
  workflowEdgeSchema,
  workflowNodeSchema,
} from '@domain/project/workflow-document-schema';
import { objectValueSchema } from '@domain/schema/object-value-schema';

export type PersistedWorkflowDocument = WorkflowDocument;

export const persistedWorkflowDocumentSchema = workflowDocumentSchema;

const accidentallyExpandedWorkflowDocumentSchema = workflowDocumentSchema
  .extend({
    nodes: z
      .array(workflowNodeSchema.extend({ inputSchema: objectValueSchema.optional() }))
      .max(5_000),
    edges: z
      .array(workflowEdgeSchema.extend({ targetPort: z.string().min(1).max(64).optional() }))
      .max(10_000),
  })
  .strict();

function cloneWithoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const clone = structuredClone(value);
  Reflect.deleteProperty(clone, key);
  return clone;
}

export function encodeWorkflowDocument(workflow: WorkflowDocument): PersistedWorkflowDocument {
  return structuredClone(persistedWorkflowDocumentSchema.parse(workflow));
}

function decodeAccidentallyExpandedWorkflow(input: unknown): WorkflowDocument | null {
  const expanded = accidentallyExpandedWorkflowDocumentSchema.safeParse(input);
  if (!expanded.success) return null;
  const unsupportedEdge = expanded.data.edges.find(
    (edge) => edge.targetPort !== undefined && edge.targetPort !== 'in',
  );
  if (unsupportedEdge) {
    throw new TypeError(
      `Workflow edge ${unsupportedEdge.id} uses non-default target port '${unsupportedEdge.targetPort}'`,
    );
  }
  return persistedWorkflowDocumentSchema.parse({
    ...expanded.data,
    nodes: expanded.data.nodes.map((node) => cloneWithoutKey(node, 'inputSchema')),
    edges: expanded.data.edges.map((edge) => cloneWithoutKey(edge, 'targetPort')),
  });
}

export function decodeWorkflowDocument(input: unknown): WorkflowDocument {
  const persisted = persistedWorkflowDocumentSchema.safeParse(input);
  if (persisted.success) return structuredClone(persisted.data);

  const expanded = decodeAccidentallyExpandedWorkflow(input);
  if (expanded) return expanded;

  const legacy = migrateLegacyWorkflow(input);
  if (legacy) return persistedWorkflowDocumentSchema.parse(legacy);

  throw new TypeError('Workflow document does not match a supported persisted format');
}
