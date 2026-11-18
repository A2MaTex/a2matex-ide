import { z } from 'zod';

import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowNode,
} from '@domain/project/project';
import { jsonValueSchema } from '@domain/schema/json-value-schema';

export const workflowNodeSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.string().min(1).max(128),
    config: z.record(z.string(), jsonValueSchema),
    editor: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        name: z.string().max(100).optional(),
        labelMode: z.enum(['icon', 'icon-and-name']).optional(),
        description: z.string().max(20_000).optional(),
      })
      .strict(),
    bindings: z.record(
      z.string(),
      z.object({ kind: z.string().min(1).max(64) }).catchall(jsonValueSchema),
    ),
    timeoutMs: z.number().int().min(1).max(600_000).optional(),
    retryPolicy: z
      .object({
        maxAttempts: z.number().int().min(1).max(3).optional(),
        delayMs: z.number().int().min(0).max(60_000).optional(),
      })
      .strict()
      .optional(),
    errorPolicy: z.enum(['STOP', 'ERROR_BRANCH']),
  })
  .strict() satisfies z.ZodType<WorkflowNode>;

export const workflowEdgeSchema = z
  .object({
    id: z.string().min(1).max(128),
    sourcePort: z.string().min(1).max(64),
    sourceNodeId: z.string().min(1).max(128),
    targetNodeId: z.string().min(1).max(128),
  })
  .strict() satisfies z.ZodType<WorkflowEdge>;

export const workflowDocumentSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_WORKFLOW_SCHEMA_VERSION),
    entryNodeId: z.string().max(128),
    nodes: z.array(workflowNodeSchema).max(5_000),
    edges: z.array(workflowEdgeSchema).max(10_000),
  })
  .strict() satisfies z.ZodType<WorkflowDocument>;
