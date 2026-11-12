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

export function toWorkflowValidationError(error: unknown): WorkflowValidationError {
  if (error instanceof WorkflowValidationError) return error;
  return new WorkflowValidationError(
    'WORKFLOW_VALIDATION_UNKNOWN_ERROR',
    'The workflow could not be validated.',
    true,
  );
}
