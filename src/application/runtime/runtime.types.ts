import type { JsonValue } from '@shared/types/json-value';

import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation.types';

export type RuntimeState = 'STOPPED' | 'STARTING' | 'READY' | 'STOPPING' | 'FAILED';

export interface RuntimeStatus {
  state: RuntimeState;
  runtimeVersion?: string;
  errorCode?: RuntimeErrorCode;
}

export interface RuntimeInfo {
  runtimeVersion: string;
  runtimeIrFormatVersions: number[];
  supportedNodes: Array<{ type: string; runtimeHandler: string }>;
}

export interface RuntimeSession {
  apiBaseUrl: string;
  sessionToken: string;
}

export interface RuntimeCompilationInput {
  editorGraph: Record<string, JsonValue>;
  inputSchema: Record<string, JsonValue>;
  projectId: string;
  sourceRevision: number;
  workflowPath: string;
}

export interface RuntimeCompilationResult {
  validation: WorkflowValidationOutput;
  runtimeIr: Record<string, JsonValue> | null;
}

export interface RuntimeDevice {
  adbSerial: string;
  status: 'READY' | 'UNAVAILABLE';
  error?: string;
}

export type RuntimeErrorCode =
  | 'RUNTIME_NOT_INSTALLED'
  | 'RUNTIME_PLATFORM_UNSUPPORTED'
  | 'RUNTIME_ALREADY_RUNNING'
  | 'RUNTIME_START_FAILED'
  | 'RUNTIME_START_TIMEOUT'
  | 'RUNTIME_READY_RECORD_INVALID'
  | 'RUNTIME_INCOMPATIBLE'
  | 'RUNTIME_SESSION_STALE'
  | 'RUNTIME_UNAVAILABLE'
  | 'RUNTIME_INVALID_REQUEST'
  | 'RUNTIME_INVALID_RESPONSE'
  | 'RUNTIME_PAYLOAD_TOO_LARGE'
  | 'RUNTIME_TIMEOUT'
  | 'RUNTIME_UNKNOWN_ERROR';

export interface RuntimeOperations {
  compile(input: RuntimeCompilationInput): Promise<RuntimeCompilationResult>;
  getStatus(): RuntimeStatus;
  listDevices(): Promise<RuntimeDevice[]>;
  onStatusChanged(listener: (status: RuntimeStatus) => void): () => void;
  refreshDevices(): Promise<RuntimeDevice[]>;
  shutdown(): Promise<void>;
  validate(editorGraph: Record<string, JsonValue>): Promise<WorkflowValidationOutput>;
}
