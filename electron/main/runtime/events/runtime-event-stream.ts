import http from 'node:http';
import https from 'node:https';

import { RuntimeError } from '@application/runtime/runtime.error';
import { runtimeErrorEnvelopeSchema } from '@application/runtime/runtime.schema';
import type { RuntimeExecutionEvent, RuntimeSession } from '@application/runtime/runtime.types';
import { RuntimeSseParser } from '@electron/main/runtime/events/runtime-sse-parser';

const OPEN_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 45_000;
const MAX_ERROR_BYTES = 8 * 1024;

export class RuntimeEventStreamError extends RuntimeError {
  constructor(
    code: ConstructorParameters<typeof RuntimeError>[0],
    message: string,
    retryable: boolean,
    options?: ConstructorParameters<typeof RuntimeError>[3],
  ) {
    super(code, message, retryable, options);
    this.name = 'RuntimeEventStreamError';
  }
}

export interface RuntimeEventStreamHandle {
  done: Promise<void>;
}

function streamUrl(session: RuntimeSession) {
  const base = new URL(session.apiBaseUrl);
  const target = new URL(`${session.apiBaseUrl.replace(/\/$/, '')}/events`);
  if (
    target.origin !== base.origin ||
    !target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)
  ) {
    throw new RuntimeEventStreamError(
      'RUNTIME_INVALID_REQUEST',
      'The Runtime event request escaped its managed API boundary.',
      false,
    );
  }
  return target;
}

export function openRuntimeEventStream(input: {
  callbacks: {
    onEvent(event: RuntimeExecutionEvent): void;
    onHeartbeat(): void;
  };
  cursor: string;
  session: RuntimeSession;
  signal: AbortSignal;
}): Promise<RuntimeEventStreamHandle> {
  return new Promise((resolve, reject) => {
    const target = streamUrl(input.session);
    const transport = target.protocol === 'https:' ? https : http;
    let opened = false;
    let settled = false;
    let abortListener: (() => void) | null = null;
    let idleTimer: NodeJS.Timeout | null = null;
    let resolveDone!: () => void;
    let rejectDone!: (error: unknown) => void;
    const done = new Promise<void>((doneResolve, doneReject) => {
      resolveDone = doneResolve;
      rejectDone = doneReject;
    });
    const finishOpen = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimer);
      if (error) reject(error);
      else resolve({ done });
    };
    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      if (abortListener) input.signal.removeEventListener('abort', abortListener);
      abortListener = null;
    };
    const fail = (error: unknown) => {
      cleanup();
      if (!opened) finishOpen(error);
      else rejectDone(error);
    };
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${input.session.sessionToken}`,
      'Cache-Control': 'no-store',
    };
    if (input.cursor !== '0') headers['Last-Event-ID'] = input.cursor;
    const request = transport.request(target, { method: 'GET', headers }, (response) => {
      opened = response.statusCode === 200;
      if (!opened) {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_ERROR_BYTES) {
            response.destroy();
            fail(
              new RuntimeEventStreamError(
                'RUNTIME_INVALID_RESPONSE',
                'The Runtime event error response exceeded its local limit.',
                false,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () => {
          let runtimeCode: string | undefined;
          let message = 'The local Runtime rejected the event stream.';
          try {
            const parsed = runtimeErrorEnvelopeSchema.safeParse(
              JSON.parse(Buffer.concat(chunks).toString('utf8')),
            );
            if (parsed.success) {
              runtimeCode = parsed.data.error.code;
              message = parsed.data.error.message;
            }
          } catch {
            // Keep bounded generic metadata for malformed non-200 bodies.
          }
          const status = response.statusCode ?? 0;
          fail(
            new RuntimeEventStreamError(
              status === 401 ? 'RUNTIME_SESSION_STALE' : 'RUNTIME_REQUEST_REJECTED',
              message,
              status >= 500,
              { httpStatus: status, runtimeCode },
            ),
          );
        });
        return;
      }
      const contentType = response.headers['content-type']?.toLowerCase() ?? '';
      if (!contentType.startsWith('text/event-stream')) {
        response.destroy();
        fail(
          new RuntimeEventStreamError(
            'RUNTIME_INVALID_RESPONSE',
            'The Runtime event stream returned an invalid content type.',
            false,
          ),
        );
        return;
      }
      const resetIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          response.destroy();
          fail(
            new RuntimeEventStreamError(
              'RUNTIME_TIMEOUT',
              'The Runtime event stream became idle.',
              true,
            ),
          );
        }, IDLE_TIMEOUT_MS);
      };
      const parser = new RuntimeSseParser({
        onEvent: (event) => {
          resetIdle();
          input.callbacks.onEvent(event);
        },
        onHeartbeat: () => {
          resetIdle();
          input.callbacks.onHeartbeat();
        },
      });
      resetIdle();
      response.on('data', (chunk: Buffer) => {
        try {
          parser.push(chunk);
        } catch (error) {
          response.destroy();
          fail(error);
        }
      });
      response.once('end', () => {
        try {
          parser.finish();
          cleanup();
          resolveDone();
        } catch (error) {
          fail(error);
        }
      });
      response.once('error', fail);
      finishOpen();
    });
    const openTimer = setTimeout(() => {
      request.destroy();
      fail(
        new RuntimeEventStreamError(
          'RUNTIME_TIMEOUT',
          'The Runtime event stream did not open in time.',
          true,
        ),
      );
    }, OPEN_TIMEOUT_MS);
    const abort = () => {
      request.destroy();
      cleanup();
      if (!opened) finishOpen(new RuntimeError('RUNTIME_REQUEST_CANCELLED', 'Cancelled.', false));
      else resolveDone();
    };
    abortListener = abort;
    if (input.signal.aborted) abort();
    else input.signal.addEventListener('abort', abort, { once: true });
    request.once('error', (error) => {
      if (input.signal.aborted) return;
      fail(
        new RuntimeEventStreamError(
          'RUNTIME_UNAVAILABLE',
          'The local Runtime event stream is unavailable.',
          true,
          { cause: error },
        ),
      );
    });
    request.end();
  });
}
