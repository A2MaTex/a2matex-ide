import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { Readable, Writable } from 'node:stream';

import { RuntimeError, toRuntimeError } from '@application/runtime/runtime.error';
import type {
  RuntimeInfo,
  RuntimeSession,
  RuntimeStatus,
} from '@application/runtime/runtime.types';
import { RuntimeHttpClient } from '@electron/main/runtime/http/runtime-http-client';
import {
  MAX_RUNTIME_READY_FRAME_BYTES,
  parseRuntimeReadyRecord,
} from '@electron/main/runtime/process/runtime-ready-record';
import { createRuntimePipes } from '@electron/main/runtime/process/runtime-pipes';

const START_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;
const SUPPORTED_RUNTIME_IR_FORMAT = 1;

interface OwnedRuntime {
  child: ChildProcess;
  command: Writable;
  session: RuntimeSession;
}

export interface RuntimeProcessManagerOptions {
  resolveAdbExecutable(): string;
  resolveExecutable(): string;
}

function selectLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a loopback port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function readReadyFrame(stream: Readable, child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffered = Buffer.alloc(0);
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      child.removeListener('exit', onExit);
      child.removeListener('error', onChildError);
      if (error) reject(error);
      else resolve(value!);
    };
    const onData = (chunk: Buffer | string) => {
      buffered = Buffer.concat([buffered, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      if (buffered.length > MAX_RUNTIME_READY_FRAME_BYTES) {
        finish(
          new RuntimeError(
            'RUNTIME_READY_RECORD_INVALID',
            'The local Runtime readiness record exceeded the allowed size.',
            false,
          ),
        );
        return;
      }
      const newline = buffered.indexOf(0x0a);
      if (newline < 0) return;
      if (buffered.subarray(newline + 1).some((byte) => ![0x0a, 0x0d, 0x20, 0x09].includes(byte))) {
        finish(
          new RuntimeError(
            'RUNTIME_READY_RECORD_INVALID',
            'The local Runtime returned more than one readiness record.',
            false,
          ),
        );
        return;
      }
      finish(undefined, buffered.subarray(0, newline).toString('utf8').replace(/\r$/, ''));
    };
    const startupExitError = (exitCode: number | null) =>
      exitCode === 2
        ? new RuntimeError(
            'RUNTIME_ALREADY_RUNNING',
            'Another Runtime is already using the execution store. Stop the standalone Runtime; Studio starts and owns its own managed Runtime.',
            false,
          )
        : new RuntimeError(
            'RUNTIME_START_FAILED',
            'The local Runtime exited before becoming ready.',
            true,
          );
    const onEnd = () => {
      if (child.exitCode !== null) {
        finish(startupExitError(child.exitCode));
        return;
      }
      setTimeout(() => {
        if (settled) return;
        finish(
          child.exitCode !== null
            ? startupExitError(child.exitCode)
            : new RuntimeError(
                'RUNTIME_START_FAILED',
                'The local Runtime closed its readiness pipe before becoming ready.',
                true,
              ),
        );
      }, 25);
    };
    const onError = (error: Error) => finish(error);
    const onExit = (exitCode: number | null) => finish(startupExitError(exitCode));
    const onChildError = (error: Error) =>
      finish(
        new RuntimeError(
          'RUNTIME_START_FAILED',
          'The local Runtime process could not be started.',
          true,
          { cause: error },
        ),
      );
    const timer = setTimeout(
      () =>
        finish(
          new RuntimeError(
            'RUNTIME_START_TIMEOUT',
            'The local Runtime did not become ready in time.',
            true,
          ),
        ),
      START_TIMEOUT_MS,
    );
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
    child.once('exit', onExit);
    child.once('error', onChildError);
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

export class RuntimeProcessManager {
  private owned: OwnedRuntime | null = null;
  private startFlight: Promise<OwnedRuntime> | null = null;
  private status: RuntimeStatus = { state: 'STOPPED' };
  private readonly listeners = new Set<(status: RuntimeStatus) => void>();

  constructor(private readonly options: RuntimeProcessManagerOptions) {}

  getStatus(): RuntimeStatus {
    return { ...this.status };
  }

  onStatusChanged(listener: (status: RuntimeStatus) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: RuntimeStatus) {
    this.status = status;
    for (const listener of this.listeners) listener({ ...status });
  }

  private watchOwned(runtime: OwnedRuntime) {
    runtime.child.once('exit', () => {
      if (this.owned?.child !== runtime.child) return;
      this.owned = null;
      const expected = this.status.state === 'STOPPING';
      this.setStatus(
        expected ? { state: 'STOPPED' } : { state: 'FAILED', errorCode: 'RUNTIME_UNAVAILABLE' },
      );
    });
    runtime.command.once('error', () => {
      if (this.owned?.child !== runtime.child) return;
      this.owned = null;
      this.setStatus({ state: 'FAILED', errorCode: 'RUNTIME_UNAVAILABLE' });
    });
    runtime.child.once('error', () => {
      if (this.owned?.child !== runtime.child) return;
      this.owned = null;
      this.setStatus({ state: 'FAILED', errorCode: 'RUNTIME_UNAVAILABLE' });
    });
  }

  private async start(): Promise<OwnedRuntime> {
    this.setStatus({ state: 'STARTING' });
    let child: ChildProcess | null = null;
    let pipes: ReturnType<typeof createRuntimePipes> | null = null;
    try {
      const executable = this.options.resolveExecutable();
      const adbExecutable = this.options.resolveAdbExecutable();
      const port = await selectLoopbackPort();
      pipes = createRuntimePipes();
      child = spawn(
        executable,
        [...pipes.childArguments, `--listen-address=127.0.0.1:${port}`, '--log-level=warn'],
        {
          env: {
            ...process.env,
            A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH: adbExecutable,
            A2MATEX_RUNTIME_ADB_ALLOW_PATH_FALLBACK: 'false',
          },
          shell: false,
          stdio: pipes.stdio,
          windowsHide: true,
        },
      );
      const { command, ready } = pipes.attach(child);
      const session = parseRuntimeReadyRecord(await readReadyFrame(ready, child));
      ready.destroy();
      const info = await new RuntimeHttpClient(session).runtimeInfo();
      if (!info.runtimeIrFormatVersions.includes(SUPPORTED_RUNTIME_IR_FORMAT)) {
        throw new RuntimeError(
          'RUNTIME_INCOMPATIBLE',
          'The local Runtime does not support this Studio Runtime IR format.',
          false,
        );
      }
      const runtime = { child, command, session };
      this.owned = runtime;
      this.watchOwned(runtime);
      this.setStatus({ state: 'READY', runtimeVersion: info.runtimeVersion });
      return runtime;
    } catch (error) {
      pipes?.dispose();
      if (child && child.exitCode === null) child.kill('SIGTERM');
      const mapped = toRuntimeError(error);
      this.setStatus({ state: 'FAILED', errorCode: mapped.code });
      throw mapped;
    }
  }

  async ensureReady(): Promise<OwnedRuntime> {
    if (this.owned && this.owned.child.exitCode === null && !this.owned.command.destroyed) {
      return this.owned;
    }
    if (!this.startFlight) {
      this.startFlight = this.start().finally(() => {
        this.startFlight = null;
      });
    }
    return this.startFlight;
  }

  private async terminateOwned() {
    const runtime = this.owned;
    this.owned = null;
    if (!runtime) return;
    try {
      if (!runtime.command.destroyed) runtime.command.end('shutdown\n');
    } catch {
      runtime.command.destroy();
    }
    if (await waitForExit(runtime.child, SHUTDOWN_TIMEOUT_MS)) return;
    runtime.child.kill('SIGTERM');
    if (await waitForExit(runtime.child, SHUTDOWN_TIMEOUT_MS)) return;
    runtime.child.kill('SIGKILL');
    await waitForExit(runtime.child, SHUTDOWN_TIMEOUT_MS);
  }

  async shutdown() {
    this.setStatus({ state: 'STOPPING' });
    if (this.startFlight) {
      try {
        await this.startFlight;
      } catch {
        // A failed startup already cleared its child and credentials.
      }
    }
    await this.terminateOwned();
    this.setStatus({ state: 'STOPPED' });
  }

  async withReadyRuntime<T>(
    operation: (client: RuntimeHttpClient, info: RuntimeInfo) => Promise<T>,
  ) {
    let runtime = await this.ensureReady();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const client = new RuntimeHttpClient(runtime.session);
      try {
        const info = await client.runtimeInfo();
        return await operation(client, info);
      } catch (error) {
        const mapped = toRuntimeError(error);
        const replaceable = [
          'RUNTIME_SESSION_STALE',
          'RUNTIME_UNAVAILABLE',
          'RUNTIME_TIMEOUT',
        ].includes(mapped.code);
        if (!replaceable || attempt === 1) throw mapped;
        this.setStatus({ state: 'FAILED', errorCode: mapped.code });
        await this.terminateOwned();
        runtime = await this.ensureReady();
      }
    }
    throw new RuntimeError('RUNTIME_UNAVAILABLE', 'The local Runtime is unavailable.', true);
  }
}
