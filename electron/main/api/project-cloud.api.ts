import axios from 'axios';
import { z } from 'zod';

import {
  CloudProjectError,
  type CloudProjectGateway,
  type CloudProjectStatus,
} from '@application/project/project-cloud';
import request from '@electron/main/api/request';

const timestampSchema = z.string().datetime({ offset: true });
const projectSchema = z
  .object({
    id: z.string().uuid(),
    publisherAccountId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    createdAt: timestampSchema,
    updatedAt: timestampSchema.nullable(),
  })
  .strict();
const jsonObjectSchema = z.record(z.string(), z.json());
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ data, statusCode: z.number().int() }).strict();
const messageEnvelope = envelope(z.object({ message: z.string() }).strict());
const projectIdEnvelope = envelope(z.object({ id: z.string().uuid() }).strict());
const projectEnvelope = envelope(projectSchema);
const projectPageEnvelope = envelope(
  z
    .object({
      items: z.array(projectSchema),
      totalItems: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      totalPages: z.number().int().nonnegative(),
    })
    .strict(),
);
const draftSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    version: z.number().int().positive(),
    editorGraph: jsonObjectSchema,
    inputSchema: jsonObjectSchema,
    runtimeIr: jsonObjectSchema.nullable(),
    validationSummary: jsonObjectSchema,
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    savedAt: timestampSchema,
  })
  .strict();
const getDraftEnvelope = envelope(
  z
    .object({ projectStatus: z.enum(['ACTIVE', 'ARCHIVED']), draft: draftSchema.nullable() })
    .strict(),
);
const draftAcknowledgementEnvelope = envelope(
  z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      contentHash: z.string().regex(/^[0-9a-f]{64}$/),
      savedAt: timestampSchema,
    })
    .strict(),
);

function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new CloudProjectError(
      'CLOUD_INVALID_RESPONSE',
      'The project service returned an invalid response.',
      true,
      undefined,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

function responseMessage(data: unknown) {
  if (!data || typeof data !== 'object') return '';
  const message = Reflect.get(data, 'message');
  return typeof message === 'string' ? message : '';
}

function responseCurrentVersion(data: unknown) {
  if (!data || typeof data !== 'object') return undefined;
  const details = Reflect.get(data, 'details');
  if (!details || typeof details !== 'object') return undefined;
  const version = Reflect.get(details, 'currentVersion');
  return typeof version === 'number' && Number.isSafeInteger(version) ? version : undefined;
}

export function toCloudProjectError(error: unknown): CloudProjectError {
  if (error instanceof CloudProjectError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = responseMessage(error.response?.data);
    if (status === 401) {
      return new CloudProjectError(
        'CLOUD_SESSION_EXPIRED',
        'The authenticated session is no longer valid.',
        false,
      );
    }
    if (message === 'Error.ProjectDraftVersionConflict') {
      return new CloudProjectError(
        'CLOUD_DRAFT_VERSION_CONFLICT',
        'The cloud draft changed before this version could be saved.',
        false,
        { currentVersion: responseCurrentVersion(error.response?.data) },
      );
    }
    if (message === 'Error.ProjectArchived') {
      return new CloudProjectError(
        'CLOUD_PROJECT_ARCHIVED',
        'The cloud project is archived.',
        false,
      );
    }
    if (message === 'Error.PublisherBlocked') {
      return new CloudProjectError(
        'CLOUD_PUBLISHER_BLOCKED',
        'The publisher account is blocked.',
        false,
      );
    }
    if (message === 'Error.PublisherNotActivated' || message === 'Error.PublisherAccountNotFound') {
      return new CloudProjectError(
        'CLOUD_PUBLISHER_UNAVAILABLE',
        'An active publisher account is required.',
        false,
      );
    }
    if (status === 403) {
      return new CloudProjectError(
        'CLOUD_FORBIDDEN',
        'You do not have permission to access this project.',
        false,
      );
    }
    if (status === 404) {
      return new CloudProjectError(
        'CLOUD_PROJECT_NOT_FOUND',
        'The cloud project was not found.',
        false,
      );
    }
    if (status === 400 || status === 422) {
      return new CloudProjectError(
        'CLOUD_INVALID_INPUT',
        'The project service rejected the request data.',
        false,
      );
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new CloudProjectError('CLOUD_TIMEOUT', 'The project service request timed out.', true);
    }
    if (status !== undefined) {
      return new CloudProjectError(
        'CLOUD_SERVER_ERROR',
        'The project service rejected the request.',
        status >= 500 || status === 429,
      );
    }
  }
  return new CloudProjectError(
    'CLOUD_NETWORK_UNAVAILABLE',
    'Unable to reach the project service.',
    true,
    undefined,
    { cause: error },
  );
}

async function call<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw toCloudProjectError(error);
  }
}

export function createProjectCloudApi(): CloudProjectGateway {
  return {
    list: (accessToken, input) =>
      call(async () => {
        const response = await request({
          method: 'GET',
          url: '/api/v1/projects',
          headers: bearer(accessToken),
          params: input,
        });
        return parse(projectPageEnvelope, response.data).data;
      }),
    create: (accessToken, input) =>
      call(async () => {
        const response = await request({
          method: 'POST',
          url: '/api/v1/projects',
          headers: bearer(accessToken),
          data: input,
        });
        return parse(projectIdEnvelope, response.data).data;
      }),
    get: (accessToken, projectId) =>
      call(async () => {
        const response = await request({
          method: 'GET',
          url: `/api/v1/projects/${encodeURIComponent(projectId)}`,
          headers: bearer(accessToken),
        });
        return parse(projectEnvelope, response.data).data;
      }),
    update: (accessToken, projectId, input) =>
      call(async () => {
        const response = await request({
          method: 'PUT',
          url: `/api/v1/projects/${encodeURIComponent(projectId)}`,
          headers: bearer(accessToken),
          data: input,
        });
        parse(messageEnvelope, response.data);
      }),
    archive: (accessToken, projectId) =>
      call(async () => {
        const response = await request({
          method: 'PUT',
          url: `/api/v1/projects/${encodeURIComponent(projectId)}/archive`,
          headers: bearer(accessToken),
        });
        parse(messageEnvelope, response.data);
      }),
    getDraft: (accessToken, projectId) =>
      call(async () => {
        const response = await request({
          method: 'GET',
          url: `/api/v1/projects/${encodeURIComponent(projectId)}/draft`,
          headers: bearer(accessToken),
        });
        return parse(getDraftEnvelope, response.data).data;
      }),
    putDraft: (accessToken, projectId, input) =>
      call(async () => {
        const response = await request({
          method: 'PUT',
          url: `/api/v1/projects/${encodeURIComponent(projectId)}/draft`,
          headers: bearer(accessToken),
          data: input,
        });
        return parse(draftAcknowledgementEnvelope, response.data).data;
      }),
  };
}

export function isCloudProjectStatus(value: string): value is CloudProjectStatus {
  return value === 'ACTIVE' || value === 'ARCHIVED';
}
