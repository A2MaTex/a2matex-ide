import axios from 'axios';
import type { ZodType } from 'zod';

import { RuntimeError } from '@application/runtime/runtime.error';
import {
  runtimeAdmissionErrorSchema,
  runtimeCompilationResultSchema,
  runtimeDevicesSchema,
  runtimeInfoSchema,
  runtimeNodeAttemptPageSchema,
  runtimeErrorEnvelopeSchema,
  runtimeRunActionConflictSchema,
  runtimeRunSnapshotSchema,
  runtimeUuidV4Schema,
} from '@application/runtime/runtime.schema';
import type {
  RuntimeCompilationResult,
  RuntimeArtifactPreview,
  RuntimeDevice,
  RuntimeInfo,
  RuntimeNodeAttemptPage,
  RuntimeRunLookupResult,
  RuntimeRunAction,
  RuntimeRunActionResult,
  RuntimeSession,
  RuntimeStartRequest,
  RuntimeStartRunResult,
} from '@application/runtime/runtime.types';
import {
  MAX_RUNTIME_ARTIFACT_BYTES,
  validateRuntimePng,
} from '@electron/main/runtime/http/runtime-artifact';
import { workflowValidationOutputSchema } from '@application/workflow-validation/workflow-validation.schema';
import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation.types';
import type { JsonValue } from '@shared/types/json-value';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 2_000;
const DEVICE_REFRESH_TIMEOUT_MS = 25_000;

interface RuntimeHttpReply<T> {
  status: number;
  body: T;
}

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
    params?: Record<string, number | string>;
    route: string;
    schema: ZodType<T>;
    successStatuses?: readonly number[];
    timeout?: number;
  }): Promise<RuntimeHttpReply<T>> {
    const route = this.assertRoute(input.route);
    try {
      const response = await this.client.request({
        url: route,
        method: input.method,
        params: input.params,
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
      const errorResponse = runtimeAdmissionErrorSchema.safeParse(response.data);
      const runtimeCode = errorResponse.success ? errorResponse.data.error.code : undefined;
      if (response.status === 401) {
        throw new RuntimeError(
          'RUNTIME_SESSION_STALE',
          'The local Runtime session is no longer valid.',
          true,
          { httpStatus: response.status, runtimeCode },
        );
      }
      if (response.status === 413) {
        throw new RuntimeError(
          'RUNTIME_PAYLOAD_TOO_LARGE',
          'The request exceeds the local Runtime payload limit.',
          false,
          { httpStatus: response.status, runtimeCode },
        );
      }
      if (response.status < 200 || response.status >= 300) {
        throw new RuntimeError(
          response.status === 400 ? 'RUNTIME_INVALID_REQUEST' : 'RUNTIME_REQUEST_REJECTED',
          errorResponse.success
            ? errorResponse.data.error.message
            : 'The local Runtime rejected the request.',
          errorResponse.success ? errorResponse.data.error.retryable : false,
          {
            httpStatus: response.status,
            runtimeCode,
            unavailableDevices: errorResponse.success
              ? errorResponse.data.unavailableDevices
              : undefined,
            validation: errorResponse.success ? errorResponse.data.validation : undefined,
          },
        );
      }
      if (input.successStatuses && !input.successStatuses.includes(response.status)) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The local Runtime returned an unexpected success status.',
          false,
          { httpStatus: response.status },
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
      return { status: response.status, body: parsed.data };
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

  async runtimeInfo(): Promise<RuntimeInfo> {
    const result = await this.request({
      method: 'GET',
      route: 'runtime-info',
      schema: runtimeInfoSchema,
      successStatuses: [200],
      timeout: PROBE_TIMEOUT_MS,
    });
    return result.body;
  }

  async validate(editorGraph: Record<string, JsonValue>): Promise<WorkflowValidationOutput> {
    const result = await this.request({
      method: 'POST',
      route: 'workflow-validation',
      body: { editorGraph },
      schema: workflowValidationOutputSchema,
      successStatuses: [200],
    });
    return result.body;
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
      successStatuses: [200],
    }).then((result) => result.body);
  }

  async listDevices(refresh: boolean): Promise<RuntimeDevice[]> {
    const result = await this.request({
      method: refresh ? 'POST' : 'GET',
      route: refresh ? 'devices/refresh' : 'devices',
      schema: runtimeDevicesSchema,
      successStatuses: [200],
      timeout: refresh ? DEVICE_REFRESH_TIMEOUT_MS : undefined,
    });
    return result.body.devices;
  }

  async startRun(input: RuntimeStartRequest): Promise<RuntimeStartRunResult> {
    const result = await this.request({
      method: 'POST',
      route: 'runs',
      body: input,
      schema: runtimeRunSnapshotSchema,
      successStatuses: [200, 201],
    });
    return {
      disposition: result.status === 201 ? 'CREATED' : 'EXISTING',
      snapshot: result.body,
    };
  }

  async submitRunAction(
    runGroupId: string,
    action: RuntimeRunAction,
  ): Promise<RuntimeRunActionResult> {
    if (!runtimeUuidV4Schema.safeParse(runGroupId).success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A canonical lowercase run group UUID v4 is required.',
        false,
      );
    }
    const route = this.assertRoute(`runs/${encodeURIComponent(runGroupId)}/actions`);
    try {
      const response = await this.client.request({
        url: route,
        method: 'POST',
        data: { action },
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 200 || response.status === 202) {
        const parsed = runtimeRunSnapshotSchema.safeParse(response.data);
        if (!parsed.success) {
          throw new RuntimeError(
            'RUNTIME_INVALID_RESPONSE',
            'The local Runtime returned an invalid action snapshot.',
            false,
            { httpStatus: response.status, cause: parsed.error },
          );
        }
        return {
          disposition: response.status === 202 ? 'ACCEPTED' : 'ALREADY_TARGET',
          snapshot: parsed.data,
        };
      }
      if (response.status === 409) {
        const parsed = runtimeRunActionConflictSchema.safeParse(response.data);
        if (!parsed.success) {
          throw new RuntimeError(
            'RUNTIME_INVALID_RESPONSE',
            'The local Runtime returned an invalid action conflict.',
            false,
            { httpStatus: response.status, cause: parsed.error },
          );
        }
        return {
          disposition: 'CONFLICT',
          error: parsed.data.error,
          snapshot: parsed.data.snapshot,
        };
      }
      const parsed = runtimeErrorEnvelopeSchema.safeParse(response.data);
      const runtimeCode = parsed.success ? parsed.data.error.code : undefined;
      throw new RuntimeError(
        response.status === 400
          ? 'RUNTIME_INVALID_REQUEST'
          : response.status === 401
            ? 'RUNTIME_SESSION_STALE'
            : response.status === 413
              ? 'RUNTIME_PAYLOAD_TOO_LARGE'
              : 'RUNTIME_REQUEST_REJECTED',
        parsed.success ? parsed.data.error.message : 'The local Runtime rejected the action.',
        parsed.success ? parsed.data.error.retryable : false,
        { httpStatus: response.status, runtimeCode },
      );
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      if (axios.isAxiosError(error)) {
        if (
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ERR_CANCELED'
        ) {
          throw new RuntimeError(
            'RUNTIME_TIMEOUT',
            'The Runtime action outcome is unknown.',
            true,
            {
              cause: error,
            },
          );
        }
      }
      throw new RuntimeError(
        'RUNTIME_UNAVAILABLE',
        'The Runtime action outcome is unknown.',
        true,
        { cause: error },
      );
    }
  }

  async activeRun(): Promise<RuntimeRunLookupResult> {
    return this.lookupRun('runs/active');
  }

  async runById(runGroupId: string): Promise<RuntimeRunLookupResult> {
    if (!runtimeUuidV4Schema.safeParse(runGroupId).success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A canonical lowercase run group UUID v4 is required.',
        false,
      );
    }
    return this.lookupRun(`runs/${encodeURIComponent(runGroupId)}`);
  }

  async nodeAttempts(
    deviceExecutionId: string,
    afterSequence = 0,
    limit = 100,
  ): Promise<RuntimeNodeAttemptPage> {
    if (
      !runtimeUuidV4Schema.safeParse(deviceExecutionId).success ||
      !Number.isSafeInteger(afterSequence) ||
      afterSequence < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A valid device execution ID and attempt page are required.',
        false,
      );
    }
    const result = await this.request({
      method: 'GET',
      route: `device-executions/${encodeURIComponent(deviceExecutionId)}/attempts`,
      params: { afterSequence, limit },
      schema: runtimeNodeAttemptPageSchema,
      successStatuses: [200],
    });
    return result.body;
  }

  async artifactPreview(artifactId: string, signal: AbortSignal): Promise<RuntimeArtifactPreview> {
    if (!runtimeUuidV4Schema.safeParse(artifactId).success) {
      throw new RuntimeError(
        'RUNTIME_INVALID_REQUEST',
        'A canonical lowercase artifact UUID v4 is required.',
        false,
      );
    }
    const route = this.assertRoute(`artifacts/${encodeURIComponent(artifactId)}`);
    try {
      const response = await this.client.request<ArrayBuffer>({
        url: route,
        method: 'GET',
        headers: { Accept: 'image/png' },
        maxContentLength: MAX_RUNTIME_ARTIFACT_BYTES,
        responseType: 'arraybuffer',
        signal,
      });
      const bytes = Uint8Array.from(new Uint8Array(response.data));
      if (response.status < 200 || response.status >= 300) {
        const errorBytes = bytes.subarray(0, Math.min(bytes.length, 8 * 1024));
        let parsed: ReturnType<typeof runtimeErrorEnvelopeSchema.safeParse> | null = null;
        try {
          parsed = runtimeErrorEnvelopeSchema.safeParse(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(errorBytes)),
          );
        } catch {
          // A malformed bounded error body is mapped to safe generic metadata.
        }
        const runtimeCode = parsed?.success ? parsed.data.error.code : undefined;
        throw new RuntimeError(
          response.status === 401
            ? 'RUNTIME_SESSION_STALE'
            : response.status === 400
              ? 'RUNTIME_INVALID_REQUEST'
              : 'RUNTIME_REQUEST_REJECTED',
          parsed?.success ? parsed.data.error.message : 'The local Runtime rejected the artifact.',
          parsed?.success ? parsed.data.error.retryable : false,
          { httpStatus: response.status, runtimeCode },
        );
      }
      if (response.status !== 200) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The local Runtime returned an unexpected artifact status.',
          false,
        );
      }
      const mimeType = String(response.headers['content-type'] ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
      if (mimeType !== 'image/png') {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The Runtime artifact is not an image/png response.',
          false,
        );
      }
      const contentLength = Number(response.headers['content-length']);
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength <= 0 ||
        contentLength > MAX_RUNTIME_ARTIFACT_BYTES ||
        contentLength !== bytes.byteLength
      ) {
        throw new RuntimeError(
          'RUNTIME_INVALID_RESPONSE',
          'The Runtime artifact length is missing, invalid or incomplete.',
          false,
        );
      }
      validateRuntimePng(bytes);
      return { bytes, mimeType: 'image/png' };
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_CANCELED' || signal.aborted) {
          throw new RuntimeError(
            'RUNTIME_REQUEST_CANCELLED',
            'The Runtime artifact preview was cancelled.',
            false,
          );
        }
        if (error.code === 'ERR_BAD_RESPONSE') {
          throw new RuntimeError(
            'RUNTIME_INVALID_RESPONSE',
            'The Runtime artifact exceeded the preview limit or was incomplete.',
            false,
            { cause: error },
          );
        }
      }
      throw new RuntimeError(
        'RUNTIME_UNAVAILABLE',
        'The local Runtime artifact is unavailable.',
        true,
        { cause: error },
      );
    }
  }

  private async lookupRun(route: string): Promise<RuntimeRunLookupResult> {
    try {
      const result = await this.request({
        method: 'GET',
        route,
        schema: runtimeRunSnapshotSchema,
        successStatuses: [200],
      });
      return { found: true, snapshot: result.body };
    } catch (error) {
      if (
        error instanceof RuntimeError &&
        error.httpStatus === 404 &&
        error.runtimeCode === 'RESOURCE_NOT_FOUND'
      ) {
        return { found: false };
      }
      throw error;
    }
  }
}
