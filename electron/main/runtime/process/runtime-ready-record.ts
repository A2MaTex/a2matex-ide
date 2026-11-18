import net from 'node:net';

import { RuntimeError } from '@application/runtime/runtime.error';
import type { RuntimeSession } from '@application/runtime/runtime.types';

export const MAX_RUNTIME_READY_FRAME_BYTES = 4 * 1024;

function isNumericLoopback(hostname: string) {
  const unwrapped =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const family = net.isIP(unwrapped);
  if (family === 4) return unwrapped.split('.')[0] === '127';
  if (family === 6) return unwrapped === '::1' || unwrapped.toLowerCase() === '0:0:0:0:0:0:0:1';
  return false;
}

export function parseRuntimeReadyRecord(frame: string): RuntimeSession {
  if (Buffer.byteLength(frame, 'utf8') > MAX_RUNTIME_READY_FRAME_BYTES) {
    throw new RuntimeError(
      'RUNTIME_READY_RECORD_INVALID',
      'The local Runtime readiness record exceeded the allowed size.',
      false,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch (error) {
    throw new RuntimeError(
      'RUNTIME_READY_RECORD_INVALID',
      'The local Runtime returned a malformed readiness record.',
      false,
      { cause: error },
    );
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new RuntimeError(
      'RUNTIME_READY_RECORD_INVALID',
      'The local Runtime returned an invalid readiness record.',
      false,
    );
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record.apiBaseUrl !== 'string' ||
    typeof record.sessionToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(record.sessionToken)
  ) {
    throw new RuntimeError(
      'RUNTIME_READY_RECORD_INVALID',
      'The local Runtime readiness credentials do not match the managed contract.',
      false,
    );
  }

  let url: URL;
  try {
    url = new URL(record.apiBaseUrl);
  } catch (error) {
    throw new RuntimeError(
      'RUNTIME_READY_RECORD_INVALID',
      'The local Runtime readiness URL is invalid.',
      false,
      { cause: error },
    );
  }
  if (
    url.protocol !== 'http:' ||
    !isNumericLoopback(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/api/v1'
  ) {
    throw new RuntimeError(
      'RUNTIME_READY_RECORD_INVALID',
      'The local Runtime readiness URL is outside the allowed loopback API boundary.',
      false,
    );
  }

  return { apiBaseUrl: url.toString().replace(/\/$/, ''), sessionToken: record.sessionToken };
}
