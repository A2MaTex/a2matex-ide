import { beforeEach, describe, expect, it, vi } from 'vitest';

import request from '@electron/main/api/request';
import { createProjectCloudApi, toCloudProjectError } from '@electron/main/api/project-cloud.api';

vi.mock('@electron/main/api/request', () => ({ default: vi.fn() }));

const mockedRequest = vi.mocked(request);

beforeEach(() => mockedRequest.mockReset());

describe('project cloud API contract', () => {
  it('reads the paginated success envelope and sends bearer authentication', async () => {
    mockedRequest.mockResolvedValueOnce({
      data: {
        data: {
          items: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              publisherAccountId: '650e8400-e29b-41d4-a716-446655440000',
              name: 'My workflow',
              description: null,
              status: 'ACTIVE',
              createdAt: '2026-11-06T08:00:00.000Z',
              updatedAt: null,
            },
          ],
          totalItems: 1,
          page: 1,
          limit: 100,
          totalPages: 1,
        },
        statusCode: 200,
      },
    } as never);

    const result = await createProjectCloudApi().list('token', { page: 1, limit: 100 });

    expect(result.items[0]).toMatchObject({ name: 'My workflow', status: 'ACTIVE' });
    expect(mockedRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { Authorization: 'Bearer token' },
      params: { page: 1, limit: 100 },
    });
  });

  it('sends the exact draft payload and rejects extra response fields', async () => {
    mockedRequest.mockResolvedValueOnce({
      data: {
        data: {
          id: '750e8400-e29b-41d4-a716-446655440000',
          version: 1,
          contentHash: 'a'.repeat(64),
          savedAt: '2026-11-06T09:00:00.000Z',
          extra: true,
        },
        statusCode: 200,
      },
    } as never);
    const payload = {
      expectedVersion: 0,
      editorGraph: {},
      inputSchema: {},
      runtimeIr: null,
      validationSummary: {},
      testSummary: {},
    };

    await expect(
      createProjectCloudApi().putDraft('token', '550e8400-e29b-41d4-a716-446655440000', payload),
    ).rejects.toMatchObject({ code: 'CLOUD_INVALID_RESPONSE' });
    expect(mockedRequest).toHaveBeenCalledWith(expect.objectContaining({ data: payload }));
  });

  it('maps the backend version-conflict details', () => {
    const error = toCloudProjectError({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          statusCode: 409,
          message: 'Error.ProjectDraftVersionConflict',
          details: { currentVersion: 3 },
        },
      },
    });

    expect(error).toMatchObject({
      code: 'CLOUD_DRAFT_VERSION_CONFLICT',
      retryable: false,
      details: { currentVersion: 3 },
    });
  });
});
