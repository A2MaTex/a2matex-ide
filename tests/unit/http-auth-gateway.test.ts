import { describe, expect, it, vi } from 'vitest';

import { HttpAuthGateway } from '../../electron/main/adapters/auth/http-auth-gateway';

describe('HttpAuthGateway', () => {
  it('posts account/password to the configured login endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { accessToken: 'access', refreshToken: 'refresh' },
          statusCode: 201,
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const gateway = new HttpAuthGateway(
      'https://api.example.com',
      10_000,
      fetchMock as typeof fetch,
    );

    await expect(gateway.login({ account: 'developer', password: 'secret' })).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://api.example.com/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ account: 'developer', password: 'secret' });
  });

  it('maps unauthorized responses without exposing the server body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'internal detail' }), { status: 401 }),
      );
    const gateway = new HttpAuthGateway(
      'https://api.example.com',
      10_000,
      fetchMock as typeof fetch,
    );

    await expect(gateway.login({ account: 'developer', password: 'wrong' })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      retryable: false,
    });
  });

  it('maps backend validation errors to invalid credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 422,
          message: [{ message: 'Error.InvalidPassword', path: 'password' }],
        }),
        { status: 422 },
      ),
    );
    const gateway = new HttpAuthGateway(
      'https://api.example.com',
      10_000,
      fetchMock as typeof fetch,
    );

    await expect(gateway.login({ account: 'developer', password: 'wrong' })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      retryable: false,
    });
  });

  it('rejects a successful response that does not contain both tokens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accessToken: 'access' }), { status: 200 }));
    const gateway = new HttpAuthGateway(
      'https://api.example.com',
      10_000,
      fetchMock as typeof fetch,
    );

    await expect(gateway.login({ account: 'developer', password: 'secret' })).rejects.toMatchObject(
      {
        code: 'AUTH_INVALID_RESPONSE',
      },
    );
  });
});
