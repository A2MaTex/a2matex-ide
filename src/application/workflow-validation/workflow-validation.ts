import { AuthError, type MainAuthSession } from '@application/auth/auth-session';
import {
  toWorkflowValidationError,
  WorkflowValidationError,
} from '@application/workflow-validation/workflow-validation.error';
import { workflowValidationInputSchema } from '@application/workflow-validation/workflow-validation.schema';
import type {
  WorkflowValidationClient,
  WorkflowValidationInput,
  WorkflowValidationOutput,
  WorkflowValidationRemoteGateway,
} from '@application/workflow-validation/workflow-validation.types';

export {
  EDITOR_GRAPH_MAX_CONTENT_BYTES,
  workflowValidationDiagnosticCodes,
} from '@application/workflow-validation/workflow-validation.constants';
export {
  toWorkflowValidationError,
  WorkflowValidationError,
} from '@application/workflow-validation/workflow-validation.error';
export type { WorkflowValidationErrorCode } from '@application/workflow-validation/workflow-validation.error';
export {
  workflowValidationDiagnosticSchema,
  workflowValidationInputSchema,
  workflowValidationOutputSchema,
  workflowValidationResponseSchema,
} from '@application/workflow-validation/workflow-validation.schema';
export type {
  WorkflowValidationClient,
  WorkflowValidationDiagnostic,
  WorkflowValidationInput,
  WorkflowValidationOutput,
  WorkflowValidationRemoteGateway,
} from '@application/workflow-validation/workflow-validation.types';

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
