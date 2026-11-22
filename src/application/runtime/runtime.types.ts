import type { JsonValue } from '@shared/types/json-value';

import type { ProjectSnapshot } from '@application/project/project-repository';
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

export interface RuntimeApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface RuntimeDevice {
  adbSerial: string;
  status: 'READY' | 'UNAVAILABLE';
  error?: RuntimeApiError;
}

export type RuntimeRunGroupStatus =
  'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export type RuntimeDeviceExecutionStatus = 'QUEUED' | RuntimeRunGroupStatus;

export interface RuntimeRunSummary {
  total: number;
  queued: number;
  running: number;
  paused: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  interrupted: number;
}

export interface RuntimeRunGroup {
  id: string;
  requestId: string;
  status: RuntimeRunGroupStatus;
  createdAt: string;
  finishedAt: string | null;
  summary: RuntimeRunSummary;
}

export interface RuntimeDeviceExecution {
  id: string;
  adbSerial: string;
  status: RuntimeDeviceExecutionStatus;
  nextNodeId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  terminalError: RuntimeApiError | null;
}

export interface RuntimeRunSnapshot {
  cursor: string;
  runGroup: RuntimeRunGroup;
  deviceExecutions: RuntimeDeviceExecution[];
}

export interface RuntimeStartDeviceInput {
  adbSerial: string;
  inputs: Record<string, JsonValue>;
}

export interface RuntimeStartRequest {
  requestId: string;
  runtimeIr: Record<string, JsonValue>;
  devices: [RuntimeStartDeviceInput];
}

export interface RuntimeStartRunInput extends RuntimeCompilationInput {
  adbSerial: string;
  clientIntentId?: string;
  inputs: Record<string, JsonValue>;
}

export type RuntimeRunPreparationPhase =
  'COMPILING' | 'PERSISTING' | 'REFRESHING_DEVICE' | 'STARTING';

export interface RuntimeRunPreparationEvent {
  clientIntentId?: string;
  phase: RuntimeRunPreparationPhase;
}

export interface RuntimeStartRunResult {
  disposition: 'CREATED' | 'EXISTING';
  snapshot: RuntimeRunSnapshot;
}

export type RuntimeRunLookupResult =
  { found: true; snapshot: RuntimeRunSnapshot } | { found: false };

export type RuntimeRunIntentResult =
  | {
      outcome: 'COMPILE_INVALID';
      validation: WorkflowValidationOutput;
    }
  | {
      outcome: 'STARTED';
      disposition: RuntimeStartRunResult['disposition'];
      projectSnapshot: ProjectSnapshot;
      snapshot: RuntimeRunSnapshot;
    };

export type RuntimeRunErrorCode =
  | RuntimeErrorCode
  | 'LOCAL_REVISION_CONFLICT'
  | 'PROJECT_ACCOUNT_UNAVAILABLE'
  | 'PROJECT_NOT_FOUND'
  | 'RUN_DEVICE_UNAVAILABLE'
  | 'RUN_PENDING_ADMISSION'
  | 'RUN_PREPARATION_BUSY';

export type RuntimeErrorCode =
  | 'RUNTIME_NOT_INSTALLED'
  | 'RUNTIME_INTEGRITY_FAILED'
  | 'RUNTIME_PLATFORM_UNSUPPORTED'
  | 'RUNTIME_ALREADY_RUNNING'
  | 'RUNTIME_START_FAILED'
  | 'RUNTIME_START_TIMEOUT'
  | 'RUNTIME_READY_RECORD_INVALID'
  | 'RUNTIME_INCOMPATIBLE'
  | 'RUNTIME_SESSION_STALE'
  | 'RUNTIME_UNAVAILABLE'
  | 'RUNTIME_INVALID_REQUEST'
  | 'RUNTIME_REQUEST_REJECTED'
  | 'RUNTIME_INVALID_RESPONSE'
  | 'RUNTIME_PAYLOAD_TOO_LARGE'
  | 'RUNTIME_TIMEOUT'
  | 'RUNTIME_UNKNOWN_ERROR';

export interface RuntimeOperations {
  activeRun(): Promise<RuntimeRunLookupResult>;
  compile(input: RuntimeCompilationInput): Promise<RuntimeCompilationResult>;
  getStatus(): RuntimeStatus;
  listDevices(): Promise<RuntimeDevice[]>;
  onStatusChanged(listener: (status: RuntimeStatus) => void): () => void;
  refreshDevices(): Promise<RuntimeDevice[]>;
  runById(runGroupId: string): Promise<RuntimeRunLookupResult>;
  shutdown(): Promise<void>;
  startRun(input: RuntimeStartRequest): Promise<RuntimeStartRunResult>;
  validate(editorGraph: Record<string, JsonValue>): Promise<WorkflowValidationOutput>;
}
