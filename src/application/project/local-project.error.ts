export type LocalProjectPersistenceErrorCode =
  | 'CORRUPTED_LOCAL_DATA'
  | 'DATABASE_MIGRATION_FAILED'
  | 'DUPLICATE_PROJECT_NAME'
  | 'LOCAL_REVISION_CONFLICT'
  | 'PROJECT_NOT_FOUND'
  | 'TRANSACTION_FAILED';

export class LocalProjectPersistenceError extends Error {
  readonly code: LocalProjectPersistenceErrorCode;
  readonly retryable: boolean;

  constructor(
    code: LocalProjectPersistenceErrorCode,
    message: string,
    retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.retryable = retryable;
    this.name = 'LocalProjectPersistenceError';
  }
}
