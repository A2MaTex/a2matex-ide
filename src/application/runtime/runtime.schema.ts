import { z } from 'zod';

import { workflowValidationOutputSchema } from '@application/workflow-validation/workflow-validation.schema';

const jsonObjectSchema = z.record(z.string(), z.json());
export const runtimeUuidV4Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const runtimeTimestampSchema = z.string().datetime({ offset: false, precision: 3 });
const boundedRuntimeStringSchema = z.string().min(1).max(8_192);

export const runtimeApiErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(128),
    message: boundedRuntimeStringSchema,
    retryable: z.boolean(),
  })
  .strict();

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
    error: runtimeApiErrorSchema.optional(),
  })
  .strict()
  .superRefine((device, context) => {
    if (device.status === 'READY' && device.error !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A READY Runtime device must not include an error.',
        path: ['error'],
      });
    }
    if (device.status === 'UNAVAILABLE' && device.error === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'An UNAVAILABLE Runtime device must include an error.',
        path: ['error'],
      });
    }
  });

export const runtimeDevicesSchema = z
  .object({ devices: z.array(runtimeDeviceSchema).max(1_000) })
  .strict();

export const runtimeErrorEnvelopeSchema = z
  .object({
    error: runtimeApiErrorSchema,
  })
  .strict();

export const runtimeAdmissionErrorSchema = z
  .object({
    error: runtimeApiErrorSchema,
    validation: workflowValidationOutputSchema.optional(),
  })
  .strict();

export const runtimeRunGroupStatusSchema = z.enum([
  'RUNNING',
  'PAUSED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
]);

export const runtimeDeviceExecutionStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
]);

export const runtimeRunSummarySchema = z
  .object({
    total: z.number().int().min(1).max(32),
    queued: z.number().int().min(0).max(32),
    running: z.number().int().min(0).max(32),
    paused: z.number().int().min(0).max(32),
    succeeded: z.number().int().min(0).max(32),
    failed: z.number().int().min(0).max(32),
    cancelled: z.number().int().min(0).max(32),
    interrupted: z.number().int().min(0).max(32),
  })
  .strict()
  .superRefine((summary, context) => {
    const counted =
      summary.queued +
      summary.running +
      summary.paused +
      summary.succeeded +
      summary.failed +
      summary.cancelled +
      summary.interrupted;
    if (counted !== summary.total) {
      context.addIssue({
        code: 'custom',
        message: 'Runtime run summary counts must equal total.',
      });
    }
  });

export const runtimeRunGroupSchema = z
  .object({
    id: runtimeUuidV4Schema,
    requestId: runtimeUuidV4Schema,
    status: runtimeRunGroupStatusSchema,
    createdAt: runtimeTimestampSchema,
    finishedAt: runtimeTimestampSchema.nullable(),
    summary: runtimeRunSummarySchema,
  })
  .strict();

export const runtimeDeviceExecutionSchema = z
  .object({
    id: runtimeUuidV4Schema,
    adbSerial: z.string().trim().min(1).max(512),
    status: runtimeDeviceExecutionStatusSchema,
    nextNodeId: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
      .nullable(),
    createdAt: runtimeTimestampSchema,
    startedAt: runtimeTimestampSchema.nullable(),
    finishedAt: runtimeTimestampSchema.nullable(),
    terminalError: runtimeApiErrorSchema.nullable(),
  })
  .strict();

export const runtimeRunSnapshotSchema = z
  .object({
    cursor: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
    runGroup: runtimeRunGroupSchema,
    deviceExecutions: z.array(runtimeDeviceExecutionSchema).min(1).max(32),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.deviceExecutions.length !== snapshot.runGroup.summary.total) {
      context.addIssue({
        code: 'custom',
        message: 'Runtime device executions must match the run summary total.',
        path: ['deviceExecutions'],
      });
    }
  });

export const runtimeStartDeviceInputSchema = z
  .object({
    adbSerial: z.string().trim().min(1).max(512),
    inputs: jsonObjectSchema,
  })
  .strict();

export const runtimeStartRequestSchema = z
  .object({
    requestId: runtimeUuidV4Schema,
    runtimeIr: jsonObjectSchema,
    devices: z.tuple([runtimeStartDeviceInputSchema]),
  })
  .strict();

export const runtimeStartRunInputSchema = runtimeCompilationInputSchema
  .extend({
    adbSerial: z.string().trim().min(1).max(512),
    clientIntentId: runtimeUuidV4Schema.optional(),
    inputs: jsonObjectSchema,
  })
  .strict();

export const runtimeValidationInputSchema = z.object({ editorGraph: jsonObjectSchema }).strict();
