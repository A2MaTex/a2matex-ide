import { z } from 'zod';

import { AuthError, type MainAuthSession } from '@application/auth/auth-session';

export const EDITOR_GRAPH_MAX_CONTENT_BYTES = 1_048_576;

export const workflowValidationDiagnosticCodes = [
  'EDITOR_GRAPH_CONTRACT_INVALID',
  'GRAPH_SCHEMA_VERSION_UNSUPPORTED',
  'NODE_ID_DUPLICATED',
  'EDGE_ID_DUPLICATED',
  'START_NODE_COUNT_INVALID',
  'ENTRY_NODE_INVALID',
  'END_NODE_UNREACHABLE',
  'EDGE_SOURCE_NODE_NOT_FOUND',
  'EDGE_TARGET_NODE_NOT_FOUND',
  'EDGE_SOURCE_PORT_NOT_FOUND',
  'END_NODE_HAS_OUTGOING_EDGE',
  'NODE_UNREACHABLE',
  'GRAPH_CYCLE_DETECTED',
  'NODE_TYPE_NOT_ACTIVE',
  'NODE_CONFIG_INVALID',
  'NODE_ERROR_POLICY_INVALID',
  'NODE_BINDINGS_INVALID',
  'NODE_VALUE_BINDING_INVALID',
  'SWITCH_PORT_EDGE_COUNT_INVALID',
  'GRAPH_NODE_LIMIT_EXCEEDED',
  'GRAPH_EDGE_LIMIT_EXCEEDED',
] as const;

const jsonObjectSchema = z.record(z.string(), z.json());

export const workflowValidationInputSchema = z
  .object({
    editorGraph: jsonObjectSchema,
  })
  .strict();

export const workflowValidationDiagnosticSchema = z
  .object({
    code: z.enum(workflowValidationDiagnosticCodes),
    message: z.string().min(1),
    nodeId: z.string().trim().min(1).max(100).optional(),
    edgeId: z.string().trim().min(1).max(100).optional(),
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
  })
  .strict();

export const workflowValidationOutputSchema = z
  .object({
    status: z.enum(['INVALID', 'VALID_WITH_WARNINGS', 'VALID']),
    errors: z.array(workflowValidationDiagnosticSchema).max(100),
    warnings: z.array(workflowValidationDiagnosticSchema).max(100),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.errors.length + output.warnings.length > 100) {
      context.addIssue({
        code: 'custom',
        message: 'Validation output cannot contain more than 100 diagnostics.',
      });
    }
    if (output.status === 'VALID' && (output.errors.length > 0 || output.warnings.length > 0)) {
      context.addIssue({
        code: 'custom',
        message: 'VALID output cannot contain diagnostics.',
      });
    }
    if (
      output.status === 'VALID_WITH_WARNINGS' &&
      (output.errors.length > 0 || output.warnings.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'VALID_WITH_WARNINGS output must contain warnings and no errors.',
      });
    }
    if (output.status === 'INVALID' && output.errors.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'INVALID output must contain at least one error.',
      });
    }
  });

export const workflowValidationResponseSchema = z
  .object({
    data: workflowValidationOutputSchema,
    statusCode: z.literal(200),
  })
  .strict();

export type WorkflowValidationInput = z.infer<typeof workflowValidationInputSchema>;
export type WorkflowValidationDiagnostic = z.infer<typeof workflowValidationDiagnosticSchema>;
export type WorkflowValidationOutput = z.infer<typeof workflowValidationOutputSchema>;

export type WorkflowValidationErrorCode =
  | 'WORKFLOW_VALIDATION_INVALID_REQUEST'
  | 'WORKFLOW_VALIDATION_SESSION_REQUIRED'
  | 'WORKFLOW_VALIDATION_SESSION_EXPIRED'
  | 'WORKFLOW_VALIDATION_FORBIDDEN'
  | 'WORKFLOW_VALIDATION_PAYLOAD_TOO_LARGE'
  | 'WORKFLOW_VALIDATION_TIMEOUT'
  | 'WORKFLOW_VALIDATION_NETWORK_UNAVAILABLE'
  | 'WORKFLOW_VALIDATION_SERVER_ERROR'
  | 'WORKFLOW_VALIDATION_INVALID_RESPONSE'
  | 'WORKFLOW_VALIDATION_CONFIGURATION_ERROR'
  | 'WORKFLOW_VALIDATION_UNKNOWN_ERROR';

export class WorkflowValidationError extends Error {
  readonly code: WorkflowValidationErrorCode;
  readonly retryable: boolean;

  constructor(code: WorkflowValidationErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'WorkflowValidationError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface WorkflowValidationRemoteGateway {
  validate(input: {
    accessToken: string;
    editorGraph: WorkflowValidationInput['editorGraph'];
  }): Promise<WorkflowValidationOutput>;
}

export interface WorkflowValidationClient {
  validate(input: WorkflowValidationInput): Promise<WorkflowValidationOutput>;
}

function mapAuthError(error: unknown): WorkflowValidationError {
  if (error instanceof WorkflowValidationError) return error;
  if (error instanceof AuthError) {
    if (error.code === 'AUTH_NETWORK_UNAVAILABLE') {
      return new WorkflowValidationError(
        'WORKFLOW_VALIDATION_NETWORK_UNAVAILABLE',
        'Unable to refresh the authenticated session.',
        true,
      );
    }
    if (error.code === 'AUTH_TIMEOUT') {
      return new WorkflowValidationError(
        'WORKFLOW_VALIDATION_TIMEOUT',
        'Refreshing the authenticated session timed out.',
        true,
      );
    }
    if (error.code === 'AUTH_SERVER_ERROR') {
      return new WorkflowValidationError(
        'WORKFLOW_VALIDATION_SERVER_ERROR',
        'The authentication service could not refresh the session.',
        error.retryable,
      );
    }
  }
  return new WorkflowValidationError(
    'WORKFLOW_VALIDATION_SESSION_REQUIRED',
    'Sign in before validating a workflow.',
    false,
  );
}

export function toWorkflowValidationError(error: unknown): WorkflowValidationError {
  if (error instanceof WorkflowValidationError) return error;
  return new WorkflowValidationError(
    'WORKFLOW_VALIDATION_UNKNOWN_ERROR',
    'The workflow could not be validated.',
    true,
  );
}

export class WorkflowValidationService implements WorkflowValidationClient {
  private readonly remote: WorkflowValidationRemoteGateway;
  private readonly auth: MainAuthSession;

  constructor(remote: WorkflowValidationRemoteGateway, auth: MainAuthSession) {
    this.remote = remote;
    this.auth = auth;
  }

  async validate(input: WorkflowValidationInput): Promise<WorkflowValidationOutput> {
    const parsedInput = workflowValidationInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new WorkflowValidationError(
        'WORKFLOW_VALIDATION_INVALID_REQUEST',
        'Workflow validation requires a JSON object named editorGraph and no extra fields.',
        false,
      );
    }

    let accessToken: string | null;
    try {
      accessToken = await this.auth.getValidAccessToken();
    } catch (error) {
      throw mapAuthError(error);
    }
    if (!accessToken) {
      throw new WorkflowValidationError(
        'WORKFLOW_VALIDATION_SESSION_REQUIRED',
        'Sign in before validating a workflow.',
        false,
      );
    }

    try {
      return await this.remote.validate({
        accessToken,
        editorGraph: parsedInput.data.editorGraph,
      });
    } catch (error) {
      const mapped = toWorkflowValidationError(error);
      if (mapped.code !== 'WORKFLOW_VALIDATION_SESSION_EXPIRED') throw mapped;
    }

    let refreshedToken: string | null;
    try {
      refreshedToken = await this.auth.refreshAccessToken();
    } catch (error) {
      throw mapAuthError(error);
    }
    if (!refreshedToken) {
      throw new WorkflowValidationError(
        'WORKFLOW_VALIDATION_SESSION_EXPIRED',
        'The authenticated session is no longer valid.',
        false,
      );
    }

    return this.remote.validate({
      accessToken: refreshedToken,
      editorGraph: parsedInput.data.editorGraph,
    });
  }
}
