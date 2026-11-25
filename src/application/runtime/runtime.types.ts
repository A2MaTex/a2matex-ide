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

export interface RuntimeUnavailableDevice {
  index: number;
  adbSerial: string;
  reason: RuntimeApiError;
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

export type RuntimeRunAction = 'PAUSE' | 'RESUME' | 'CANCEL';
export type RuntimeControlPhase = 'IDLE' | 'SUBMITTING' | 'PENDING' | 'UNCERTAIN' | 'RESOLVED';
export type RuntimeControlResolution =
  | 'TARGET_OBSERVED'
  | 'ALREADY_TARGET'
  | 'TERMINAL_WINNER'
  | 'CONFLICT'
  | 'REJECTED'
  | 'SESSION_ENDED';

export interface RuntimeControlState {
  action: RuntimeRunAction | null;
  lastError: RuntimeApiError | null;
  phase: RuntimeControlPhase;
  resolution: RuntimeControlResolution | null;
  runGroupId: string;
  sessionGeneration: number;
  submissionVersion: number;
}

export interface RuntimeRunActionResult {
  disposition: 'ACCEPTED' | 'ALREADY_TARGET' | 'CONFLICT';
  error?: RuntimeApiError;
  snapshot: RuntimeRunSnapshot;
}

export interface RuntimeControlSubmissionResult {
  controlState: RuntimeControlState;
  disposition: RuntimeRunActionResult['disposition'] | null;
  snapshot: RuntimeRunSnapshot | null;
}

export type RuntimeNodeAttemptStatus =
  'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED' | 'INTERRUPTED';

export interface RuntimeNodeAttempt {
  id: string;
  deviceExecutionId: string;
  sequence: number;
  nodeId: string;
  attemptNumber: number;
  status: RuntimeNodeAttemptStatus;
  startedAt: string;
  finishedAt: string | null;
  output: Record<string, JsonValue> | null;
  error: RuntimeApiError | null;
}

export interface RuntimeNodeAttemptPage {
  attempts: RuntimeNodeAttempt[];
  nextAfterSequence: number | null;
}

export type RuntimeExecutionEvent =
  | {
      cursor: string;
      type: 'RUN_GROUP_STATE_CHANGED';
      occurredAt: string;
      runGroupId: string;
      payload: { status: RuntimeRunGroupStatus };
    }
  | {
      cursor: string;
      type: 'DEVICE_EXECUTION_STATE_CHANGED';
      occurredAt: string;
      runGroupId: string;
      deviceExecutionId: string;
      payload: {
        status: RuntimeDeviceExecutionStatus;
        nextNodeId: string | null;
        error?: RuntimeApiError;
      };
    }
  | {
      cursor: string;
      type: 'NODE_ATTEMPT_STATE_CHANGED';
      occurredAt: string;
      runGroupId: string;
      deviceExecutionId: string;
      nodeAttemptId: string;
      nodeId: string;
      payload: {
        status: RuntimeNodeAttemptStatus;
        attemptNumber: number;
        output?: Record<string, JsonValue>;
        error?: RuntimeApiError;
      };
    }
  | {
      cursor: string;
      type: 'NODE_RETRY_SCHEDULED';
      occurredAt: string;
      runGroupId: string;
      deviceExecutionId: string;
      nodeAttemptId: string;
      nodeId: string;
      payload: { nextAttemptNumber: number; delayMs: number };
    };

export type RuntimeObservationHealth = 'connecting' | 'live' | 'reconnecting' | 'stale' | 'error';

export interface RuntimeLiveAttemptFact {
  attemptNumber: number;
  nodeAttemptId: string;
  nodeId: string;
  status: RuntimeNodeAttemptStatus;
}

export interface RuntimeRetryFact {
  delayMs: number;
  nextAttemptNumber: number;
  nodeAttemptId: string;
  nodeId: string;
}

export interface RuntimeObservationView {
  attemptsRevision: number;
  cursor: string;
  controlState: RuntimeControlState;
  error: RuntimeApiError | null;
  health: RuntimeObservationHealth;
  liveAttempt: RuntimeLiveAttemptFact | null;
  pendingRetry: RuntimeRetryFact | null;
  selectedDeviceExecutionId: string | null;
  snapshot: RuntimeRunSnapshot;
  stale: boolean;
}

export interface RuntimeObservationEnvelope {
  observationId: string;
  version: number;
  view: RuntimeObservationView;
}

export interface RuntimeObservationStart {
  initialView: RuntimeObservationEnvelope;
  observationId: string;
}

export interface RuntimeArtifactPreview {
  bytes: Uint8Array;
  mimeType: 'image/png';
}

export interface RuntimeStartDeviceInput {
  adbSerial: string;
  inputs: Record<string, JsonValue>;
}

export interface RuntimeStartRequest {
  requestId: string;
  runtimeIr: Record<string, JsonValue>;
  devices: RuntimeStartDeviceInput[];
}

export interface RuntimeStartRunInput extends RuntimeCompilationInput {
  clientIntentId?: string;
  devices: RuntimeStartDeviceInput[];
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
  | 'RUNTIME_REQUEST_CANCELLED'
  | 'RUNTIME_AUTOMATIC_WORK_SUPPRESSED'
  | 'RUNTIME_TIMEOUT'
  | 'RUNTIME_UNKNOWN_ERROR';

export interface RuntimeOperations {
  activeRun(): Promise<RuntimeRunLookupResult>;
  artifactPreview(artifactId: string, signal: AbortSignal): Promise<RuntimeArtifactPreview>;
  ackObservation(observationId: string, version: number): void;
  compile(input: RuntimeCompilationInput): Promise<RuntimeCompilationResult>;
  checkRunControl(runGroupId: string): Promise<RuntimeControlSubmissionResult>;
  getStatus(): RuntimeStatus;
  listDevices(): Promise<RuntimeDevice[]>;
  nodeAttempts(
    deviceExecutionId: string,
    afterSequence?: number,
    limit?: number,
  ): Promise<RuntimeNodeAttemptPage>;
  onStatusChanged(listener: (status: RuntimeStatus) => void): () => void;
  observeRun(
    runGroupId: string,
    listener: (envelope: RuntimeObservationEnvelope) => void,
  ): Promise<RuntimeObservationStart>;
  refreshDevices(): Promise<RuntimeDevice[]>;
  resumeAutomaticWork(): void;
  runById(runGroupId: string): Promise<RuntimeRunLookupResult>;
  selectObservedDevice(observationId: string, deviceExecutionId: string): void;
  shutdown(): Promise<void>;
  submitRunAction(
    runGroupId: string,
    action: RuntimeRunAction,
  ): Promise<RuntimeControlSubmissionResult>;
  suppressAutomaticWork(lock?: boolean): void;
  hasUnresolvedControl(): boolean;
  startRun(input: RuntimeStartRequest): Promise<RuntimeStartRunResult>;
  stopObserving(observationId: string): void;
  validate(editorGraph: Record<string, JsonValue>): Promise<WorkflowValidationOutput>;
}
