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

export const runtimeDevicesSchema = z.object({ devices: z.array(runtimeDeviceSchema) }).strict();

export const runtimeErrorEnvelopeSchema = z
  .object({
    error: runtimeApiErrorSchema,
  })
  .strict();

export const runtimeUnavailableDeviceSchema = z
  .object({
    index: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    adbSerial: z.string().trim().min(1).max(512),
    reason: runtimeApiErrorSchema,
  })
  .strict();

export const runtimeAdmissionErrorSchema = z
  .object({
    error: runtimeApiErrorSchema,
    validation: workflowValidationOutputSchema.optional(),
    unavailableDevices: z.array(runtimeUnavailableDeviceSchema).optional(),
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
    total: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    queued: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    running: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    paused: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    succeeded: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    failed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    cancelled: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    interrupted: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
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
    deviceExecutions: z.array(runtimeDeviceExecutionSchema).min(1),
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
    const ids = new Set<string>();
    const serials = new Set<string>();
    snapshot.deviceExecutions.forEach((execution, index) => {
      if (ids.has(execution.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Runtime device execution IDs must be unique.',
          path: ['deviceExecutions', index, 'id'],
        });
      }
      if (serials.has(execution.adbSerial)) {
        context.addIssue({
          code: 'custom',
          message: 'Runtime device execution serials must be unique.',
          path: ['deviceExecutions', index, 'adbSerial'],
        });
      }
      ids.add(execution.id);
      serials.add(execution.adbSerial);
    });
  });

export const runtimeNodeAttemptStatusSchema = z.enum([
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'INTERRUPTED',
]);

export const runtimeNodeAttemptSchema = z
  .object({
    id: runtimeUuidV4Schema,
    deviceExecutionId: runtimeUuidV4Schema,
    sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    nodeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    attemptNumber: z.number().int().min(1).max(3),
    status: runtimeNodeAttemptStatusSchema,
    startedAt: runtimeTimestampSchema,
    finishedAt: runtimeTimestampSchema.nullable(),
    output: jsonObjectSchema.nullable(),
    error: runtimeApiErrorSchema.nullable(),
  })
  .strict();

export const runtimeNodeAttemptPageSchema = z
  .object({
    attempts: z.array(runtimeNodeAttemptSchema).max(100),
    nextAfterSequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .strict()
  .superRefine((page, context) => {
    const ids = new Set<string>();
    let previous = 0;
    page.attempts.forEach((attempt, index) => {
      if (ids.has(attempt.id) || attempt.sequence <= previous) {
        context.addIssue({
          code: 'custom',
          message: 'Runtime attempts must have unique IDs and increasing sequences.',
          path: ['attempts', index],
        });
      }
      ids.add(attempt.id);
      previous = attempt.sequence;
    });
    if (
      page.nextAfterSequence !== null &&
      page.nextAfterSequence !== page.attempts.at(-1)?.sequence
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Runtime attempt continuation must equal the last returned sequence.',
        path: ['nextAfterSequence'],
      });
    }
  });

export const runtimeNodeAttemptsInputSchema = z
  .object({
    deviceExecutionId: runtimeUuidV4Schema,
    afterSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

const runtimeEventBaseSchema = z.object({
  cursor: z.string().regex(/^[1-9][0-9]*$/),
  occurredAt: runtimeTimestampSchema,
  runGroupId: runtimeUuidV4Schema,
});

export const runtimeExecutionEventSchema = z
  .discriminatedUnion('type', [
    runtimeEventBaseSchema
      .extend({
        type: z.literal('RUN_GROUP_STATE_CHANGED'),
        payload: z.object({ status: runtimeRunGroupStatusSchema }).strict(),
      })
      .strict(),
    runtimeEventBaseSchema
      .extend({
        type: z.literal('DEVICE_EXECUTION_STATE_CHANGED'),
        deviceExecutionId: runtimeUuidV4Schema,
        payload: z
          .object({
            status: runtimeDeviceExecutionStatusSchema,
            nextNodeId: z
              .string()
              .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
              .nullable(),
            error: runtimeApiErrorSchema.optional(),
          })
          .strict(),
      })
      .strict(),
    runtimeEventBaseSchema
      .extend({
        type: z.literal('NODE_ATTEMPT_STATE_CHANGED'),
        deviceExecutionId: runtimeUuidV4Schema,
        nodeAttemptId: runtimeUuidV4Schema,
        nodeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
        payload: z
          .object({
            status: runtimeNodeAttemptStatusSchema,
            attemptNumber: z.number().int().min(1).max(3),
            output: jsonObjectSchema.optional(),
            error: runtimeApiErrorSchema.optional(),
          })
          .strict(),
      })
      .strict(),
    runtimeEventBaseSchema
      .extend({
        type: z.literal('NODE_RETRY_SCHEDULED'),
        deviceExecutionId: runtimeUuidV4Schema,
        nodeAttemptId: runtimeUuidV4Schema,
        nodeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
        payload: z
          .object({
            nextAttemptNumber: z.number().int().min(2).max(3),
            delayMs: z.number().int().min(0).max(60_000),
          })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((event, context) => {
    if (BigInt(event.cursor) > 9_223_372_036_854_775_807n) {
      context.addIssue({ code: 'custom', message: 'Runtime event cursor exceeds int64.' });
    }
    if (event.type === 'DEVICE_EXECUTION_STATE_CHANGED') {
      if (event.payload.error && !['FAILED', 'INTERRUPTED'].includes(event.payload.status)) {
        context.addIssue({
          code: 'custom',
          message: 'Runtime device errors are only valid for failed terminal states.',
          path: ['payload', 'error'],
        });
      }
      return;
    }
    if (event.type !== 'NODE_ATTEMPT_STATE_CHANGED') return;
    const { status, output, error } = event.payload;
    const invalid =
      (status === 'RUNNING' && (output !== undefined || error !== undefined)) ||
      (status === 'SUCCEEDED' && (output === undefined || error !== undefined)) ||
      (['FAILED', 'TIMED_OUT', 'INTERRUPTED'].includes(status) &&
        (error === undefined || output !== undefined)) ||
      (status === 'CANCELLED' && (output !== undefined || error !== undefined));
    if (invalid) {
      context.addIssue({
        code: 'custom',
        message: 'Runtime attempt event payload does not match its status.',
        path: ['payload'],
      });
    }
  });

export const runtimeObserveRunInputSchema = z.object({ runGroupId: runtimeUuidV4Schema }).strict();

export const runtimeRunActionSchema = z.enum(['PAUSE', 'RESUME', 'CANCEL']);

export const runtimeRunActionInputSchema = z
  .object({ runGroupId: runtimeUuidV4Schema, action: runtimeRunActionSchema })
  .strict();

export const runtimeCheckRunControlInputSchema = z
  .object({ runGroupId: runtimeUuidV4Schema })
  .strict();

export const runtimeRunActionConflictSchema = z
  .object({ error: runtimeApiErrorSchema, snapshot: runtimeRunSnapshotSchema })
  .strict();

export const runtimeObservationControlInputSchema = z
  .object({ observationId: runtimeUuidV4Schema })
  .strict();

export const runtimeObservationAckInputSchema = runtimeObservationControlInputSchema
  .extend({ version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
  .strict();

export const runtimeObservationDeviceInputSchema = runtimeObservationControlInputSchema
  .extend({ deviceExecutionId: runtimeUuidV4Schema })
  .strict();

export const runtimeArtifactPreviewInputSchema = z
  .object({ requestId: runtimeUuidV4Schema, artifactId: runtimeUuidV4Schema })
  .strict();

export const runtimeArtifactPreviewCancelInputSchema = z
  .object({ requestId: runtimeUuidV4Schema })
  .strict();

export const runtimeStartDeviceInputSchema = z
  .object({
    adbSerial: z.string().trim().min(1).max(512),
    inputs: jsonObjectSchema,
  })
  .strict();

export const runtimeStartDevicesSchema = z
  .array(runtimeStartDeviceInputSchema)
  .min(1)
  .superRefine((devices, context) => {
    const serials = new Set<string>();
    devices.forEach((device, index) => {
      if (serials.has(device.adbSerial)) {
        context.addIssue({
          code: 'custom',
          message: 'Runtime device serials must be unique.',
          path: [index, 'adbSerial'],
        });
      }
      serials.add(device.adbSerial);
    });
  });

export const runtimeStartRequestSchema = z
  .object({
    requestId: runtimeUuidV4Schema,
    runtimeIr: jsonObjectSchema,
    devices: runtimeStartDevicesSchema,
  })
  .strict();

export const runtimeStartRunInputSchema = runtimeCompilationInputSchema
  .extend({
    clientIntentId: runtimeUuidV4Schema.optional(),
    devices: runtimeStartDevicesSchema,
  })
  .strict();

export const runtimeValidationInputSchema = z.object({ editorGraph: jsonObjectSchema }).strict();
