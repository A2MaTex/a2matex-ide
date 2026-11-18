import { z } from 'zod';

import { workflowValidationOutputSchema } from '@application/workflow-validation/workflow-validation.schema';

const jsonObjectSchema = z.record(z.string(), z.json());

export const runtimeInfoSchema = z
  .object({
    runtimeVersion: z.string().trim().min(1).max(100),
    runtimeIrFormatVersions: z.array(z.number().int().positive()).max(32),
    supportedNodes: z
      .array(
        z
          .object({
            type: z.string().trim().min(1).max(128),
            runtimeHandler: z.string().trim().min(1).max(256),
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict();

export const runtimeCompilationInputSchema = z
  .object({
    editorGraph: jsonObjectSchema,
    inputSchema: jsonObjectSchema,
    projectId: z.string().trim().min(1).max(256),
    workflowPath: z.string().trim().min(1).max(1_024),
    sourceRevision: z.number().int().nonnegative(),
  })
  .strict();

export const runtimeCompilationResultSchema = z
  .object({
    validation: workflowValidationOutputSchema,
    runtimeIr: jsonObjectSchema.nullable(),
  })
  .strict();

export const runtimeDeviceSchema = z
  .object({
    adbSerial: z.string().trim().min(1).max(512),
    status: z.enum(['READY', 'UNAVAILABLE']),
    error: z.string().max(4_096).optional(),
  })
  .strict();

export const runtimeDevicesSchema = z
  .object({ devices: z.array(runtimeDeviceSchema).max(1_000) })
  .strict();

export const runtimeErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(128),
        message: z.string().trim().min(1).max(8_192),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const runtimeValidationInputSchema = z.object({ editorGraph: jsonObjectSchema }).strict();
