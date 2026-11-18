import axios from 'axios';
import type { ZodType } from 'zod';

import { RuntimeError } from '@application/runtime/runtime.error';
import {
  runtimeCompilationResultSchema,
  runtimeDevicesSchema,
  runtimeErrorEnvelopeSchema,
  runtimeInfoSchema,
} from '@application/runtime/runtime.schema';
import type {
  RuntimeCompilationResult,
  RuntimeDevice,
  RuntimeInfo,
  RuntimeSession,
} from '@application/runtime/runtime.types';
import { workflowValidationOutputSchema } from '@application/workflow-validation/workflow-validation.schema';
import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation.types';
import type { JsonValue } from '@shared/types/json-value';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 2_000;

export class RuntimeHttpClient {
  private readonly client;

  constructor(private readonly session: RuntimeSession) {
    this.client = axios.create({
      baseURL: session.apiBaseUrl,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.sessionToken}`,
        'Cache-Control': 'no-store',
      },
      maxBodyLength: MAX_REQUEST_BYTES,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxRedirects: 0,
      proxy: false,
      timeout: REQUEST_TIMEOUT_MS,
      transitional: { clarifyTimeoutError: true },
      validateStatus: () => true,
    });
  }

  private assertRoute(route: string) {
    const base = new URL(this.session.apiBaseUrl);
    const target = new URL(`${this.session.apiBaseUrl}/${route.replace(/^\//, '')}`);
    if (target.origin !== base.origin || !target.pathname.startsWith(`${base.pathname}/`)) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'The local Runtime request escaped its managed API boundary.',
        false,
      );
    }
    return target.pathname.slice(base.pathname.length + 1);
  }

  private async request<T>(input: {
    body?: unknown;
    method: 'GET' | 'POST';
    route: string;
    schema: ZodType<T>;
    timeout?: number;
  }): Promise<T> {
    const route = this.assertRoute(input.route);
    try {
      const response = await this.client.request({
        url: route,
        method: input.method,
        ...(input.body === undefined
          ? {}
          : { data: input.body, headers: { 'Content-Type': 'application/json' } }),
        timeout: input.timeout,
      });
      if (response.status >= 300 && response.status < 400) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The local Runtime attempted an unsupported redirect.',
          false,
        );
      }
      if (response.status === 401) {
        throw new RuntimeError(
          'RUNTIME_SESSION_STALE',
          'The local Runtime session is no longer valid.',
          true,
        );
      }
      if (response.status === 413) {
        throw new RuntimeError(
          'RUNTIME_PAYLOAD_TOO_LARGE',
          'The request exceeds the local Runtime payload limit.',
          false,
        );
      }
      if (response.status < 200 || response.status >= 300) {
        const envelope = runtimeErrorEnvelopeSchema.safeParse(response.data);
        throw new RuntimeError(
          response.status === 400 || response.status === 422
            ? 'RUNTIME_INVALID_REQUEST'
            : 'RUNTIME_UNAVAILABLE',
          envelope.success
            ? envelope.data.error.message
            : 'The local Runtime rejected the request.',
          envelope.success ? envelope.data.error.retryable : response.status >= 500,
        );
      }
      const parsed = input.schema.safeParse(response.data);
      if (!parsed.success) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The local Runtime returned a response that does not match its contract.',
          false,
          { cause: parsed.error },
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      if (axios.isAxiosError(error)) {
        if (
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ERR_CANCELED'
        ) {
          throw new RuntimeError('RUNTIME_TIMEOUT', 'The local Runtime request timed out.', true, {
            cause: error,
          });
        }
        if (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
          throw new RuntimeError(
            'RUNTIME_PAYLOAD_TOO_LARGE',
            'The request exceeds the local Runtime payload limit.',
            false,
            { cause: error },
          );
        }
      }
      throw new RuntimeError('RUNTIME_UNAVAILABLE', 'The local Runtime is unavailable.', true, {
        cause: error,
      });
    }
  }

  runtimeInfo(): Promise<RuntimeInfo> {
    return this.request({
      method: 'GET',
      route: 'runtime-info',
      schema: runtimeInfoSchema,
      timeout: PROBE_TIMEOUT_MS,
    });
  }

  validate(editorGraph: Record<string, JsonValue>): Promise<WorkflowValidationOutput> {
    return this.request({
      method: 'POST',
      route: 'workflow-validation',
      body: { editorGraph },
      schema: workflowValidationOutputSchema,
    });
  }

  compile(input: {
    editorGraph: Record<string, JsonValue>;
    inputSchema: Record<string, JsonValue>;
  }): Promise<RuntimeCompilationResult> {
    return this.request({
      method: 'POST',
      route: 'workflow-compilation',
      body: input,
      schema: runtimeCompilationResultSchema,
    });
  }

  async listDevices(refresh: boolean): Promise<RuntimeDevice[]> {
    const result = await this.request({
      method: refresh ? 'POST' : 'GET',
      route: refresh ? 'devices/refresh' : 'devices',
      schema: runtimeDevicesSchema,
    });
    return result.devices;
  }
}
