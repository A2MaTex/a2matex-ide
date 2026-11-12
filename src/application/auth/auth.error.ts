export type AuthErrorCode =
  | 'AUTH_INVALID_INPUT'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_ACCOUNT_BLOCKED'
  | 'AUTH_ACCESS_DENIED'
  | 'AUTH_NETWORK_UNAVAILABLE'
  | 'AUTH_TIMEOUT'
  | 'AUTH_SERVER_ERROR'
  | 'AUTH_INVALID_RESPONSE'
  | 'AUTH_CONFIGURATION_ERROR'
  | 'AUTH_CREDENTIAL_STORAGE_ERROR'
  | 'AUTH_UNKNOWN_ERROR';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly retryable: boolean;

  constructor(code: AuthErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  return new AuthError('AUTH_UNKNOWN_ERROR', 'Authentication failed unexpectedly.', true);
}
