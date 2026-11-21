import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { RuntimeError, toRuntimeError } from '@application/runtime/runtime.error';
import {
  runtimeCompilationInputSchema,
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
const MAX_START_RUN_REQUEST_BYTES = 2 * 1024 * 1024;

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
      ...(mapped.validation === undefined ? {} : { validation: mapped.validation }),
      ...(mapped instanceof RuntimeRunCoordinatorError && mapped.projectSnapshot
        ? { projectSnapshot: mapped.projectSnapshot }
        : {}),
    },
  };
}

function register(channel: string, handler: (rawInput: unknown) => Promise<unknown>) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, rawInput: unknown) => {
    try {
      assertTrustedSender(event);
      return { ok: true, value: await handler(rawInput) };
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
  register(IPC_CHANNELS.runtimeGetStatus, async () => runtime.getStatus());
  register(IPC_CHANNELS.runtimeValidate, async (rawInput) => {
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
    return runtime.validate(input.data.editorGraph);
  });
  register(IPC_CHANNELS.runtimeCompile, async (rawInput) => {
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
    const result = await runtime.compile(input.data);
    await options.persistCompilation?.(input.data, result);
    return result;
  });
  register(IPC_CHANNELS.runtimeListDevices, async () => runtime.listDevices());
  register(IPC_CHANNELS.runtimeRefreshDevices, async () => runtime.refreshDevices());
  register(IPC_CHANNELS.runtimeStartRun, async (rawInput) => {
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
    return options.runs.startRun(input.data);
  });
  register(IPC_CHANNELS.runtimeGetActiveRun, async () => options.runs.activeRun());
  register(IPC_CHANNELS.runtimeGetRun, async (rawInput) => {
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
  register(IPC_CHANNELS.runtimeShutdown, async () => {
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
    unsubscribeStatus();
    unsubscribePreparation();
  };
}
