import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { RuntimeError, toRuntimeError } from '@application/runtime/runtime.error';
import {
  runtimeCompilationInputSchema,
  runtimeArtifactPreviewCancelInputSchema,
  runtimeArtifactPreviewInputSchema,
  runtimeCheckRunControlInputSchema,
  runtimeNodeAttemptsInputSchema,
  runtimeObservationAckInputSchema,
  runtimeObservationControlInputSchema,
  runtimeObservationDeviceInputSchema,
  runtimeObserveRunInputSchema,
  runtimeRunActionInputSchema,
  runtimeStartRunInputSchema,
  runtimeUuidV4Schema,
  runtimeValidationInputSchema,
} from '@application/runtime/runtime.schema';
import type {
  RuntimeCompilationInput,
  RuntimeCompilationResult,
  RuntimeOperations,
  RuntimeRunErrorCode,
} from '@application/runtime/runtime.types';
import {
  RuntimeRunCoordinatorError,
  type RuntimeRunController,
} from '@electron/main/runtime/run/runtime-run-coordinator';
import { IPC_CHANNELS } from '@electron/shared/channels';
import type { HostResult } from '@infrastructure/electron/studio-host-api';

const MAX_VALIDATION_REQUEST_BYTES = 1024 * 1024 + 4 * 1024;
const MAX_COMPILATION_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_START_RUN_REQUEST_BYTES = 4 * 1024 * 1024;

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const developmentUrl = process.env.A2MATEX_DEV_SERVER_URL;
  const trusted =
    senderUrl.startsWith('file:') || (developmentUrl && senderUrl.startsWith(developmentUrl));
  if (!trusted) throw new Error('Untrusted IPC sender');
}

function failure(error: unknown): HostResult<never, RuntimeRunErrorCode> {
  const mapped = error instanceof RuntimeRunCoordinatorError ? error : toRuntimeError(error);
  return {
    ok: false,
    error: {
      code: mapped.code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(mapped.httpStatus === undefined ? {} : { httpStatus: mapped.httpStatus }),
      ...(mapped.runtimeCode === undefined ? {} : { runtimeCode: mapped.runtimeCode }),
      ...(mapped.unavailableDevices === undefined
        ? {}
        : { unavailableDevices: mapped.unavailableDevices }),
      ...(mapped.validation === undefined ? {} : { validation: mapped.validation }),
      ...(mapped instanceof RuntimeRunCoordinatorError && mapped.projectSnapshot
        ? { projectSnapshot: mapped.projectSnapshot }
        : {}),
    },
  };
}

function register(
  channel: string,
  handler: (event: IpcMainInvokeEvent, rawInput: unknown) => Promise<unknown>,
) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, rawInput: unknown) => {
    try {
      assertTrustedSender(event);
      return { ok: true, value: await handler(event, rawInput) };
    } catch (error) {
      return failure(error);
    }
  });
}

export function registerRuntimeHandlers(
  runtime: RuntimeOperations,
  options: {
    persistCompilation?: (
      input: RuntimeCompilationInput,
      result: RuntimeCompilationResult,
    ) => Promise<void>;
    runs: RuntimeRunController;
  },
) {
  const observations = new Map<number, string>();
  const activePreviews = new Map<number, { controller: AbortController; requestId: string }>();

  const stopSenderObservation = (senderId: number) => {
    const observationId = observations.get(senderId);
    if (observationId) runtime.stopObserving(observationId);
    observations.delete(senderId);
  };

  register(IPC_CHANNELS.runtimeGetStatus, async () => runtime.getStatus());
  register(IPC_CHANNELS.runtimeValidate, async (_event, rawInput) => {
    const input = runtimeValidationInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'Runtime validation requires a valid Editor Graph.',
        false,
      );
    }
    if (Buffer.byteLength(JSON.stringify(input.data), 'utf8') > MAX_VALIDATION_REQUEST_BYTES) {
      throw new RuntimeError(
        'RUNTIME_PAYLOAD_TOO_LARGE',
        'The validation request exceeds the local Runtime payload limit.',
        false,
      );
    }
    runtime.resumeAutomaticWork();
    return runtime.validate(input.data.editorGraph);
  });
  register(IPC_CHANNELS.runtimeCompile, async (_event, rawInput) => {
    const input = runtimeCompilationInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'Runtime compilation requires a graph, input schema and source revision.',
        false,
      );
    }
    if (Buffer.byteLength(JSON.stringify(input.data), 'utf8') > MAX_COMPILATION_REQUEST_BYTES) {
      throw new RuntimeError(
        'RUNTIME_PAYLOAD_TOO_LARGE',
        'The compilation request exceeds the local Runtime payload limit.',
        false,
      );
    }
    runtime.resumeAutomaticWork();
    const result = await runtime.compile(input.data);
    await options.persistCompilation?.(input.data, result);
    return result;
  });
  register(IPC_CHANNELS.runtimeListDevices, async () => {
    runtime.resumeAutomaticWork();
    return runtime.listDevices();
  });
  register(IPC_CHANNELS.runtimeRefreshDevices, async () => {
    runtime.resumeAutomaticWork();
    return runtime.refreshDevices();
  });
  register(IPC_CHANNELS.runtimeStartRun, async (_event, rawInput) => {
    const input = runtimeStartRunInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A Test Run requires a valid saved graph, device and workflow inputs.',
        false,
      );
    }
    if (Buffer.byteLength(JSON.stringify(input.data), 'utf8') > MAX_START_RUN_REQUEST_BYTES) {
      throw new RuntimeError(
        'RUNTIME_PAYLOAD_TOO_LARGE',
        'The Test Run request exceeds the local IPC payload limit.',
        false,
      );
    }
    runtime.resumeAutomaticWork();
    return options.runs.startRun(input.data);
  });
  register(IPC_CHANNELS.runtimeGetActiveRun, async () => options.runs.activeRun());
  register(IPC_CHANNELS.runtimeGetRun, async (_event, rawInput) => {
    const runGroupId = runtimeUuidV4Schema.safeParse(rawInput);
    if (!runGroupId.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A canonical lowercase run group UUID v4 is required.',
        false,
      );
    }
    return options.runs.runById(runGroupId.data);
  });
  register(IPC_CHANNELS.runtimeSubmitRunAction, async (_event, rawInput) => {
    const input = runtimeRunActionInputSchema.safeParse(rawInput);
    if (!input.success || !options.runs.ownsRunGroup(input.data.runGroupId)) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'Runtime controls are only available for the owned active run group.',
        false,
      );
    }
    runtime.resumeAutomaticWork();
    const result = await runtime.submitRunAction(input.data.runGroupId, input.data.action);
    if (result.snapshot && result.disposition !== 'ACCEPTED') {
      options.runs.acceptObservation(result.snapshot, result.snapshot.cursor);
    }
    return result;
  });
  register(IPC_CHANNELS.runtimeCheckRunControl, async (_event, rawInput) => {
    const input = runtimeCheckRunControlInputSchema.safeParse(rawInput);
    if (!input.success || !options.runs.ownsRunGroup(input.data.runGroupId)) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'Runtime control state can only be checked for the owned active run group.',
        false,
      );
    }
    runtime.resumeAutomaticWork();
    const result = await runtime.checkRunControl(input.data.runGroupId);
    if (result.snapshot) {
      options.runs.acceptObservation(result.snapshot, result.snapshot.cursor);
    }
    return result;
  });
  register(IPC_CHANNELS.runtimeGetNodeAttempts, async (_event, rawInput) => {
    const input = runtimeNodeAttemptsInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A valid device execution ID and attempt page are required.',
        false,
      );
    }
    return runtime.nodeAttempts(
      input.data.deviceExecutionId,
      input.data.afterSequence,
      input.data.limit,
    );
  });
  register(IPC_CHANNELS.runtimeObserveRun, async (event, rawInput) => {
    const input = runtimeObserveRunInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError('RUNTIME_INVALID_REQUEST', 'A valid run group is required.', false);
    }
    const senderId = event.sender.id;
    stopSenderObservation(senderId);
    let observationId = '';
    const result = await runtime.observeRun(input.data.runGroupId, (envelope) => {
      options.runs.acceptObservation(envelope.view.snapshot, envelope.view.cursor);
      if (
        !event.sender.isDestroyed() &&
        observationId === envelope.observationId &&
        observations.get(senderId) === observationId
      ) {
        event.sender.send(IPC_CHANNELS.runtimeObservationChanged, envelope);
      }
    });
    observationId = result.observationId;
    options.runs.acceptObservation(
      result.initialView.view.snapshot,
      result.initialView.view.cursor,
    );
    observations.set(senderId, observationId);
    event.sender.once('destroyed', () => stopSenderObservation(senderId));
    return result;
  });
  register(IPC_CHANNELS.runtimeAckObservation, async (event, rawInput) => {
    const input = runtimeObservationAckInputSchema.safeParse(rawInput);
    if (!input.success || observations.get(event.sender.id) !== input.data.observationId) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The observation ACK is not owned by this view.',
        false,
      );
    }
    runtime.ackObservation(input.data.observationId, input.data.version);
  });
  register(IPC_CHANNELS.runtimeSelectObservedDevice, async (event, rawInput) => {
    const input = runtimeObservationDeviceInputSchema.safeParse(rawInput);
    if (!input.success || observations.get(event.sender.id) !== input.data.observationId) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The observation is not owned by this view.',
        false,
      );
    }
    runtime.selectObservedDevice(input.data.observationId, input.data.deviceExecutionId);
  });
  register(IPC_CHANNELS.runtimeStopObserving, async (event, rawInput) => {
    const input = runtimeObservationControlInputSchema.safeParse(rawInput);
    if (!input.success || observations.get(event.sender.id) !== input.data.observationId) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The observation is not owned by this view.',
        false,
      );
    }
    stopSenderObservation(event.sender.id);
  });
  register(IPC_CHANNELS.runtimeGetArtifactPreview, async (event, rawInput) => {
    const input = runtimeArtifactPreviewInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'Valid preview and artifact IDs are required.',
        false,
      );
    }
    const senderId = event.sender.id;
    activePreviews.get(senderId)?.controller.abort();
    const controller = new AbortController();
    activePreviews.set(senderId, { controller, requestId: input.data.requestId });
    const onDestroyed = () => controller.abort();
    event.sender.once('destroyed', onDestroyed);
    try {
      return await runtime.artifactPreview(input.data.artifactId, controller.signal);
    } finally {
      event.sender.removeListener('destroyed', onDestroyed);
      if (activePreviews.get(senderId)?.requestId === input.data.requestId) {
        activePreviews.delete(senderId);
      }
    }
  });
  register(IPC_CHANNELS.runtimeCancelArtifactPreview, async (event, rawInput) => {
    const input = runtimeArtifactPreviewCancelInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A valid preview request ID is required.',
        false,
      );
    }
    const active = activePreviews.get(event.sender.id);
    if (active?.requestId === input.data.requestId) active.controller.abort();
  });
  register(IPC_CHANNELS.runtimeShutdown, async () => {
    runtime.suppressAutomaticWork();
    for (const preview of activePreviews.values()) preview.controller.abort();
    activePreviews.clear();
    for (const senderId of observations.keys()) stopSenderObservation(senderId);
    await runtime.shutdown();
    options.runs.runtimeStopped();
  });

  const unsubscribeStatus = runtime.onStatusChanged((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.runtimeStatusChanged, status);
    }
  });
  const unsubscribePreparation = options.runs.onPreparationChanged((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.runtimeRunPreparationChanged, event);
      }
    }
  });
  return () => {
    for (const preview of activePreviews.values()) preview.controller.abort();
    for (const senderId of observations.keys()) stopSenderObservation(senderId);
    unsubscribeStatus();
    unsubscribePreparation();
  };
}
