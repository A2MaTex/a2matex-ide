import type {
  RuntimeErrorCode,
  RuntimeUnavailableDevice,
} from '@application/runtime/runtime.types';
import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation.types';

export interface RuntimeErrorOptions extends ErrorOptions {
  httpStatus?: number;
  runtimeCode?: string;
  unavailableDevices?: RuntimeUnavailableDevice[];
  validation?: WorkflowValidationOutput;
}

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly runtimeCode?: string;
  readonly unavailableDevices?: RuntimeUnavailableDevice[];
  readonly validation?: WorkflowValidationOutput;

  constructor(
    code: RuntimeErrorCode,
    message: string,
    retryable: boolean,
    options?: RuntimeErrorOptions,
  ) {
    super(message, options);
    this.name = 'RuntimeError';
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.retryable = retryable;
    this.runtimeCode = options?.runtimeCode;
    this.unavailableDevices = options?.unavailableDevices;
    this.validation = options?.validation;
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
