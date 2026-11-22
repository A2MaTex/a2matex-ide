import { spawn } from 'node:child_process';

import { AndroidInspectorError } from '@application/android-inspector/android-inspector';
import type { AndroidDevice } from '@domain/android-inspector/android-inspector';

const DEFAULT_TIMEOUT_MS = 10_000;

export class AdbCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = 'AdbCommandError';
  }
}

export class AdbOutputLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`ADB output exceeded ${maxBytes} bytes.`);
    this.name = 'AdbOutputLimitError';
  }
}

interface RunAdbOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxStdoutBytes: number;
}

export interface AdbProcessRunner {
  run(args: readonly string[], options: RunAdbOptions): Promise<Buffer>;
}

export class NodeAdbProcessRunner implements AdbProcessRunner {
  constructor(private readonly executable = process.env.A2MATEX_ADB_PATH?.trim() || 'adb') {}

  run(args: readonly string[], options: RunAdbOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let settled = false;

      const finish = (error?: Error, output?: Buffer) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(output ?? Buffer.alloc(0));
      };
      const abort = () => {
        child.kill();
        finish(
          new AndroidInspectorError(
            'CAPTURE_TIMEOUT',
            'Android Inspector capture timed out.',
            true,
          ),
        );
      };
      const timer = setTimeout(abort, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > options.maxStdoutBytes) {
          child.kill();
          finish(new AdbOutputLimitError(options.maxStdoutBytes));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.reduce((total, entry) => total + entry.length, 0) < 64 * 1024) {
          stderr.push(chunk);
        }
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        finish(
          error.code === 'ENOENT'
            ? new AndroidInspectorError(
                'ADB_NOT_FOUND',
                'ADB was not found. Configure A2MATEX_ADB_PATH or add adb to PATH.',
                false,
              )
            : new AndroidInspectorError('ADB_START_FAILED', 'ADB could not be started.', true),
        );
      });
      child.on('close', (code) => {
        if (code === 0) {
          finish(undefined, Buffer.concat(stdout));
          return;
        }
        const detail = Buffer.concat(stderr).toString('utf8').trim().slice(0, 500);
        finish(new AdbCommandError(detail || 'ADB command failed.', code));
      });
    });
  }
}

export function parseAdbDevices(output: string): AndroidDevice[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached') && !line.startsWith('*'))
    .flatMap((line) => {
      const [deviceId, rawStatus, ...details] = line.split(/\s+/);
      if (!deviceId || !rawStatus) return [];
      const status =
        rawStatus === 'device' || rawStatus === 'offline' || rawStatus === 'unauthorized'
          ? rawStatus
          : 'unknown';
      const metadata = Object.fromEntries(
        details.flatMap((detail) => {
          const separator = detail.indexOf(':');
          return separator > 0 ? [[detail.slice(0, separator), detail.slice(separator + 1)]] : [];
        }),
      );
      return [
        {
          deviceId,
          status,
          usable: status === 'device',
          ...(metadata.model ? { model: metadata.model.replaceAll('_', ' ') } : {}),
          ...(metadata.product ? { product: metadata.product } : {}),
          ...(metadata.device ? { deviceName: metadata.device } : {}),
          ...(metadata.transport_id ? { transportId: metadata.transport_id } : {}),
        } satisfies AndroidDevice,
      ];
    });
}

export interface AdbClient {
  listDevices(signal?: AbortSignal): Promise<AndroidDevice[]>;
  captureScreenshot(deviceId: string, signal?: AbortSignal): Promise<Buffer>;
  getScreenSize(deviceId: string, signal?: AbortSignal): Promise<string>;
  captureHierarchy(deviceId: string, remotePath: string, signal?: AbortSignal): Promise<string>;
}

export class ProcessAdbClient implements AdbClient {
  constructor(private readonly runner: AdbProcessRunner = new NodeAdbProcessRunner()) {}

  async listDevices(signal?: AbortSignal) {
    const output = await this.runner.run(['devices', '-l'], {
      signal,
      maxStdoutBytes: 1024 * 1024,
    });
    return parseAdbDevices(output.toString('utf8'));
  }

  captureScreenshot(deviceId: string, signal?: AbortSignal) {
    return this.runner.run(['-s', deviceId, 'exec-out', 'screencap', '-p'], {
      signal,
      maxStdoutBytes: 20 * 1024 * 1024,
    });
  }

  async getScreenSize(deviceId: string, signal?: AbortSignal) {
    const output = await this.runner.run(['-s', deviceId, 'shell', 'wm', 'size'], {
      signal,
      maxStdoutBytes: 64 * 1024,
    });
    return output.toString('utf8');
  }

  async captureHierarchy(deviceId: string, remotePath: string, signal?: AbortSignal) {
    try {
      await this.runner.run(
        ['-s', deviceId, 'shell', 'uiautomator', 'dump', '--compressed', remotePath],
        { signal, maxStdoutBytes: 1024 * 1024 },
      );
      const output = await this.runner.run(['-s', deviceId, 'exec-out', 'cat', remotePath], {
        signal,
        maxStdoutBytes: 5 * 1024 * 1024,
      });
      return output.toString('utf8');
    } finally {
      try {
        await this.runner.run(['-s', deviceId, 'shell', 'rm', '-f', remotePath], {
          maxStdoutBytes: 64 * 1024,
          timeoutMs: 3_000,
        });
      } catch {
        // Remote cleanup is best effort and must not hide the capture result.
      }
    }
  }
}
