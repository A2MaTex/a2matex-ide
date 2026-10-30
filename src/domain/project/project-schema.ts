import { z } from 'zod';

import type { JsonValue } from '@shared/types/json-value';

import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type ProjectDocument,
  type ProjectManifest,
  type WorkflowDocument,
} from '@domain/project/project';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const workflowPathSchema = z
  .string()
  .regex(/^workflows\/[A-Za-z0-9._-]+\.workflow\.json$/, 'Invalid workflow path');

const assetPathSchema = z
  .string()
  .regex(/^assets\/[A-Za-z0-9._/-]+$/, 'Invalid asset path')
  .refine((value) => !value.split('/').includes('..'), 'Asset path may not traverse directories');

export const projectManifestV1Schema: z.ZodType<ProjectManifest> = z
  .object({
    schemaVersion: z.literal(CURRENT_PROJECT_SCHEMA_VERSION),
    projectId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2_000).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    entryWorkflow: workflowPathSchema,
    minimumRuntimeVersion: z.string().min(1).max(64),
    workflows: z.array(workflowPathSchema).min(1).max(100),
    assets: z
      .array(z.object({ path: assetPathSchema, type: z.enum(['data', 'image']) }).passthrough())
      .max(1_000),
    permissions: z
      .array(
        z
          .object({ id: z.string().min(1).max(128), reason: z.string().max(500).optional() })
          .passthrough(),
      )
      .max(100),
    environment: z
      .array(
        z
          .object({
            name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
            type: z.enum(['boolean', 'json', 'number', 'string']),
            default: jsonValueSchema.optional(),
            secret: z.boolean().optional(),
          })
          .passthrough(),
      )
      .max(200),
    publisher: z
      .object({ id: z.string().min(1).max(128) })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine((manifest) => manifest.workflows.includes(manifest.entryWorkflow), {
    message: 'Entry workflow must be declared in workflows',
    path: ['entryWorkflow'],
  });

const workflowNodeSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.string().min(1).max(128),
    nodeVersion: z.number().int().positive(),
    name: z.string().max(100).optional(),
    disabled: z.boolean().optional(),
    params: z.record(z.string(), jsonValueSchema),
  })
  .passthrough();

const workflowEdgeSchema = z
  .object({
    id: z.string().min(1).max(128),
    source: z.object({ nodeId: z.string().min(1), port: z.string().min(1) }).passthrough(),
    target: z.object({ nodeId: z.string().min(1), port: z.string().min(1) }).passthrough(),
  })
  .passthrough();

export const workflowDocumentV1Schema: z.ZodType<WorkflowDocument> = z
  .object({
    schemaVersion: z.literal(CURRENT_WORKFLOW_SCHEMA_VERSION),
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(100),
    nodes: z.array(workflowNodeSchema).max(5_000),
    edges: z.array(workflowEdgeSchema).max(10_000),
    layout: z
      .object({
        nodes: z.record(
          z.string(),
          z.object({ x: z.number().finite(), y: z.number().finite() }).passthrough(),
        ),
        viewport: z
          .object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive() })
          .passthrough()
          .optional(),
      })
      .passthrough(),
    metadata: z.record(z.string(), jsonValueSchema).optional(),
  })
  .passthrough();

export const projectDocumentSchema: z.ZodType<ProjectDocument> = z
  .object({
    manifest: projectManifestV1Schema,
    workflows: z.record(workflowPathSchema, workflowDocumentV1Schema),
  })
  .superRefine((document, context) => {
    for (const workflowPath of document.manifest.workflows) {
      if (!document.workflows[workflowPath]) {
        context.addIssue({ code: 'custom', message: `Missing workflow: ${workflowPath}` });
      }
    }
  });
