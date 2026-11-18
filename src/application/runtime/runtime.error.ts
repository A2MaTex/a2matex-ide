import type { RuntimeErrorCode } from '@application/runtime/runtime.types';

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly retryable: boolean;

  constructor(code: RuntimeErrorCode, message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RuntimeError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toRuntimeError(error: unknown): RuntimeError {
  if (error instanceof RuntimeError) return error;
  return new RuntimeError(
    'RUNTIME_UNKNOWN_ERROR',
    'The local Runtime operation failed unexpectedly.',
    true,
    error === undefined ? undefined : { cause: error },
  );
}
