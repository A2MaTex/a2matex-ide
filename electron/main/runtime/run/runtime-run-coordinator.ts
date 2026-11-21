import { randomUUID } from 'node:crypto';

import {
  LocalProjectPersistenceError,
  type LocalProjectRepository,
  type LocalProjectSnapshot,
} from '@application/project/local-project-repository';
import { RuntimeError } from '@application/runtime/runtime.error';
import type {
  RuntimeCompilationResult,
  RuntimeOperations,
  RuntimeRunErrorCode,
  RuntimeRunIntentResult,
  RuntimeRunLookupResult,
  RuntimeRunPreparationEvent,
  RuntimeRunSnapshot,
  RuntimeStartRequest,
  RuntimeStartRunInput,
} from '@application/runtime/runtime.types';
import { toRuntimeEditorGraph } from '@application/runtime/to-runtime-editor-graph';
import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation.types';

const TERMINAL_RUN_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

export interface RuntimeRunCoordinatorErrorOptions extends ErrorOptions {
  httpStatus?: number;
  projectSnapshot?: LocalProjectSnapshot;
  runtimeCode?: string;
  validation?: WorkflowValidationOutput;
}

export class RuntimeRunCoordinatorError extends Error {
  readonly code: RuntimeRunErrorCode;
  readonly httpStatus?: number;
  readonly projectSnapshot?: LocalProjectSnapshot;
  readonly retryable: boolean;
  readonly runtimeCode?: string;
  readonly validation?: WorkflowValidationOutput;

  constructor(
    code: RuntimeRunErrorCode,
    message: string,
    retryable: boolean,
    options?: RuntimeRunCoordinatorErrorOptions,
  ) {
    super(message, options);
    this.name = 'RuntimeRunCoordinatorError';
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.projectSnapshot = options?.projectSnapshot;
    this.retryable = retryable;
    this.runtimeCode = options?.runtimeCode;
    this.validation = options?.validation;
  }
}

export interface RuntimeRunController {
  activeRun(): Promise<RuntimeRunLookupResult>;
  hasUnresolvedRun(): boolean;
  onPreparationChanged(listener: (event: RuntimeRunPreparationEvent) => void): () => void;
  runById(runGroupId: string): Promise<RuntimeRunLookupResult>;
  runtimeStopped(): void;
  startRun(input: RuntimeStartRunInput): Promise<RuntimeRunIntentResult>;
}

interface PendingAdmission {
  body: RuntimeStartRequest;
  clientIntentId?: string;
  intentFingerprint: string;
  projectSnapshot: LocalProjectSnapshot;
}

export interface RuntimeRunCoordinatorOptions {
  accountScope(): Promise<string>;
  createRequestId?: () => string;
  projects: Pick<LocalProjectRepository, 'findById' | 'saveRuntimeCompilation'>;
  runtime: RuntimeOperations;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function terminal(snapshot: RuntimeRunSnapshot) {
  return TERMINAL_RUN_STATES.has(snapshot.runGroup.status);
}

function mapCoordinatorError(
  error: unknown,
  projectSnapshot?: LocalProjectSnapshot,
): RuntimeRunCoordinatorError {
  if (error instanceof RuntimeRunCoordinatorError) {
    if (!projectSnapshot || error.projectSnapshot) return error;
    return new RuntimeRunCoordinatorError(error.code, error.message, error.retryable, {
      cause: error,
      httpStatus: error.httpStatus,
      projectSnapshot,
      runtimeCode: error.runtimeCode,
      validation: error.validation,
    });
  }
  if (error instanceof RuntimeError) {
    return new RuntimeRunCoordinatorError(error.code, error.message, error.retryable, {
      cause: error,
      httpStatus: error.httpStatus,
      projectSnapshot,
      runtimeCode: error.runtimeCode,
      validation: error.validation,
    });
  }
  if (error instanceof LocalProjectPersistenceError) {
    const code =
      error.code === 'LOCAL_REVISION_CONFLICT' || error.code === 'PROJECT_NOT_FOUND'
        ? error.code
        : 'RUNTIME_UNKNOWN_ERROR';
    return new RuntimeRunCoordinatorError(code, error.message, error.retryable, {
      cause: error,
      projectSnapshot,
    });
  }
  return new RuntimeRunCoordinatorError(
    'RUNTIME_UNKNOWN_ERROR',
    'The Test Run operation failed unexpectedly.',
    true,
    error === undefined ? { projectSnapshot } : { cause: error, projectSnapshot },
  );
}

function uncertainAdmission(error: unknown) {
  if (error instanceof RuntimeRunCoordinatorError || error instanceof RuntimeError) {
    return (
      [
        'RUNTIME_INVALID_RESPONSE',
        'RUNTIME_SESSION_STALE',
        'RUNTIME_TIMEOUT',
        'RUNTIME_UNAVAILABLE',
      ].includes(error.code) ||
      (error.httpStatus !== undefined && error.httpStatus >= 500)
    );
  }
  return true;
}

export class RuntimeRunCoordinator implements RuntimeRunController {
  private activeSnapshot: RuntimeRunSnapshot | null = null;
  private pendingAdmission: PendingAdmission | null = null;
  private preparing = false;
  private readonly preparationListeners = new Set<(event: RuntimeRunPreparationEvent) => void>();
  private readonly accountScope: () => Promise<string>;
  private readonly createRequestId: () => string;
  private readonly projects: RuntimeRunCoordinatorOptions['projects'];
  private readonly runtime: RuntimeOperations;

  constructor(options: RuntimeRunCoordinatorOptions) {
    this.accountScope = options.accountScope;
    this.createRequestId = options.createRequestId ?? randomUUID;
    this.projects = options.projects;
    this.runtime = options.runtime;
  }

  async startRun(input: RuntimeStartRunInput): Promise<RuntimeRunIntentResult> {
    if (this.preparing) {
      throw new RuntimeRunCoordinatorError(
        'RUN_PREPARATION_BUSY',
        'Another Test Run is already being prepared or submitted.',
        true,
      );
    }
    this.preparing = true;
    const immutableInput = structuredClone(input);
    const intentFingerprint = canonicalJson(immutableInput);
    try {
      if (this.activeSnapshot && !terminal(this.activeSnapshot)) {
        throw new RuntimeRunCoordinatorError(
          'RUN_PREPARATION_BUSY',
          'A Test Run is already active.',
          true,
        );
      }
      if (this.pendingAdmission) {
        if (this.pendingAdmission.intentFingerprint !== intentFingerprint) {
          throw new RuntimeRunCoordinatorError(
            'RUN_PENDING_ADMISSION',
            'A previous Test Run admission is uncertain. Retry that same intent before starting another one.',
            true,
            { projectSnapshot: this.pendingAdmission.projectSnapshot },
          );
        }
        return await this.submitPendingAdmission();
      }

      const accountScope = await this.accountScope();
      const current = await this.projects.findById(accountScope, immutableInput.projectId);
      this.assertCurrentSource(current, immutableInput);

      this.emitPreparation(immutableInput.clientIntentId, 'COMPILING');
      const compilation = await this.runtime.compile(immutableInput);
      if (compilation.runtimeIr === null || compilation.validation.status === 'INVALID') {
        return { outcome: 'COMPILE_INVALID', validation: compilation.validation };
      }

      let projectSnapshot: LocalProjectSnapshot;
      try {
        this.emitPreparation(immutableInput.clientIntentId, 'PERSISTING');
        projectSnapshot = await this.persistCompilation(accountScope, immutableInput, compilation);
      } catch (error) {
        throw mapCoordinatorError(error);
      }

      try {
        this.emitPreparation(immutableInput.clientIntentId, 'REFRESHING_DEVICE');
        const devices = await this.runtime.refreshDevices();
        const selected = devices.find((device) => device.adbSerial === immutableInput.adbSerial);
        if (!selected || selected.status !== 'READY') {
          throw new RuntimeRunCoordinatorError(
            'RUN_DEVICE_UNAVAILABLE',
            selected?.error?.message ??
              'The selected Android device is no longer available to the local Runtime.',
            true,
            { projectSnapshot },
          );
        }

        this.pendingAdmission = {
          body: {
            requestId: this.createRequestId(),
            runtimeIr: compilation.runtimeIr,
            devices: [{ adbSerial: immutableInput.adbSerial, inputs: immutableInput.inputs }],
          },
          clientIntentId: immutableInput.clientIntentId,
          intentFingerprint,
          projectSnapshot,
        };
        return await this.submitPendingAdmission();
      } catch (error) {
        throw mapCoordinatorError(error, projectSnapshot);
      }
    } catch (error) {
      throw mapCoordinatorError(error);
    } finally {
      this.preparing = false;
    }
  }

  async activeRun(): Promise<RuntimeRunLookupResult> {
    const result = await this.runtime.activeRun();
    if (!result.found) {
      this.activeSnapshot = null;
      return result;
    }
    this.acceptReadSnapshot(result.snapshot);
    return result;
  }

  hasUnresolvedRun() {
    return Boolean(
      this.pendingAdmission || (this.activeSnapshot && !terminal(this.activeSnapshot)),
    );
  }

  onPreparationChanged(listener: (event: RuntimeRunPreparationEvent) => void) {
    this.preparationListeners.add(listener);
    return () => this.preparationListeners.delete(listener);
  }

  runtimeStopped() {
    this.activeSnapshot = null;
    this.pendingAdmission = null;
  }

  async runById(runGroupId: string): Promise<RuntimeRunLookupResult> {
    const result = await this.runtime.runById(runGroupId);
    if (result.found) this.acceptReadSnapshot(result.snapshot);
    return result;
  }

  private assertCurrentSource(
    current: LocalProjectSnapshot | null,
    input: RuntimeStartRunInput,
  ): asserts current is LocalProjectSnapshot {
    if (!current) {
      throw new RuntimeRunCoordinatorError(
        'PROJECT_NOT_FOUND',
        'The local project was not found in the current account.',
        false,
      );
    }
    const workflow = current.document.workflows[input.workflowPath];
    const sourceMatches =
      current.draftState.sourceRevision === input.sourceRevision &&
      current.document.manifest.entryWorkflow === input.workflowPath &&
      workflow !== undefined &&
      canonicalJson(toRuntimeEditorGraph(workflow)) === canonicalJson(input.editorGraph) &&
      canonicalJson(current.draftState.inputSchema) === canonicalJson(input.inputSchema);
    if (!sourceMatches) {
      throw new RuntimeRunCoordinatorError(
        'LOCAL_REVISION_CONFLICT',
        'The saved entry workflow changed before the Test Run could be compiled.',
        true,
      );
    }
  }

  private persistCompilation(
    accountScope: string,
    input: RuntimeStartRunInput,
    compilation: RuntimeCompilationResult,
  ) {
    return this.projects.saveRuntimeCompilation({
      accountScope,
      expectedSourceRevision: input.sourceRevision,
      localId: input.projectId,
      runtimeIr: compilation.runtimeIr,
      validationSummary: compilation.validation,
      workflowPath: input.workflowPath,
    });
  }

  private async submitPendingAdmission(): Promise<RuntimeRunIntentResult> {
    const pending = this.pendingAdmission;
    if (!pending) {
      throw new RuntimeRunCoordinatorError(
        'RUN_PENDING_ADMISSION',
        'There is no pending Test Run admission to retry.',
        false,
      );
    }
    try {
      this.emitPreparation(pending.clientIntentId, 'STARTING');
      const result = await this.runtime.startRun(pending.body);
      const execution = result.snapshot.deviceExecutions[0];
      if (
        result.snapshot.runGroup.requestId !== pending.body.requestId ||
        !execution ||
        execution.adbSerial !== pending.body.devices[0].adbSerial
      ) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The local Runtime returned a Run snapshot for a different admission request.',
          false,
        );
      }
      this.pendingAdmission = null;
      this.activeSnapshot = terminal(result.snapshot) ? null : result.snapshot;
      return {
        outcome: 'STARTED',
        disposition: result.disposition,
        projectSnapshot: pending.projectSnapshot,
        snapshot: result.snapshot,
      };
    } catch (error) {
      if (!uncertainAdmission(error)) this.pendingAdmission = null;
      throw mapCoordinatorError(error, pending.projectSnapshot);
    }
  }

  private acceptReadSnapshot(snapshot: RuntimeRunSnapshot) {
    if (this.pendingAdmission?.body.requestId === snapshot.runGroup.requestId) {
      this.pendingAdmission = null;
    }
    this.activeSnapshot = terminal(snapshot) ? null : snapshot;
  }

  private emitPreparation(
    clientIntentId: string | undefined,
    phase: RuntimeRunPreparationEvent['phase'],
  ) {
    const event = { ...(clientIntentId ? { clientIntentId } : {}), phase };
    for (const listener of this.preparationListeners) listener(event);
  }
}
