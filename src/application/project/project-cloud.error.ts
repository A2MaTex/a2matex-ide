export type CloudProjectErrorCode =
  | 'CLOUD_CONFIGURATION_ERROR'
  | 'CLOUD_DRAFT_UNSUPPORTED'
  | 'CLOUD_DRAFT_VERSION_CONFLICT'
  | 'CLOUD_FORBIDDEN'
  | 'CLOUD_INVALID_INPUT'
  | 'CLOUD_INVALID_RESPONSE'
  | 'CLOUD_LOCAL_CHANGES'
  | 'CLOUD_NAME_CONFLICT'
  | 'CLOUD_NETWORK_UNAVAILABLE'
  | 'CLOUD_PROJECT_ARCHIVED'
  | 'CLOUD_PROJECT_NOT_FOUND'
  | 'CLOUD_PUBLISHER_BLOCKED'
  | 'CLOUD_PUBLISHER_UNAVAILABLE'
  | 'CLOUD_SERVER_ERROR'
  | 'CLOUD_SESSION_EXPIRED'
  | 'CLOUD_TIMEOUT';

export class CloudProjectError extends Error {
  readonly code: CloudProjectErrorCode;
  readonly retryable: boolean;
  readonly details?: { currentVersion?: number };

  constructor(
    code: CloudProjectErrorCode,
    message: string,
    retryable: boolean,
    details?: { currentVersion?: number },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    this.name = 'CloudProjectError';
  }
}
