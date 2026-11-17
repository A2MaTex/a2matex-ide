import { z } from 'zod';

import { CURRENT_PROJECT_SCHEMA_VERSION, type ProjectManifest } from '@domain/project/project';
import { jsonValueSchema } from '@domain/schema/json-value-schema';

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
    name: z.string().trim().min(1).max(255),
    description: z.string().max(4_000).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    entryWorkflow: workflowPathSchema,
    minimumRuntimeVersion: z.string().min(1).max(64),
    workflows: z.array(workflowPathSchema).min(1).max(100),
    workflowKinds: z.record(workflowPathSchema, z.enum(['flow', 'subflow'])).optional(),
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
  })
  .refine(
    (manifest) =>
      !manifest.workflowKinds ||
      Object.keys(manifest.workflowKinds).every((path) => manifest.workflows.includes(path)),
    { message: 'Workflow kind references an undeclared workflow', path: ['workflowKinds'] },
  );
