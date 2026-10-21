import { afterEach, describe, expect, it, vi } from 'vitest';

import { postLogin } from '../../electron/main/api/auth-api';
import { instanceAxios } from '../../electron/main/api/request';

function axiosError(status?: number, code?: string) {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    code,
    response: status === undefined ? undefined : { status },
  });
}

describe('auth API', () => {
  afterEach(() => vi.restoreAllMocks());
  it('posts account/password to the login endpoint', async () => {
    const request = vi.spyOn(instanceAxios, 'request').mockResolvedValue({
      data: {
        data: { accessToken: 'access', refreshToken: 'refresh' },
        statusCode: 201,
      },
      status: 201,
    });

    await expect(postLogin({ account: 'developer', password: 'secret' })).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(request).toHaveBeenCalledWith({
      url: '/api/v1/auth/login',
      method: 'POST',
      data: { account: 'developer', password: 'secret' },
    });
  });

  it.each([401, 422])('maps status %s to invalid credentials', async (status) => {
    vi.spyOn(instanceAxios, 'request').mockRejectedValue(axiosError(status));

    await expect(postLogin({ account: 'developer', password: 'wrong' })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      retryable: false,
    });
  });

  it('maps Axios timeout errors', async () => {
    vi.spyOn(instanceAxios, 'request').mockRejectedValue(axiosError(undefined, 'ECONNABORTED'));

    await expect(postLogin({ account: 'developer', password: 'secret' })).rejects.toMatchObject({
      code: 'AUTH_TIMEOUT',
      retryable: true,
    });
  });

  it('rejects a response missing required tokens', async () => {
    vi.spyOn(instanceAxios, 'request').mockResolvedValue({
      data: { data: { accessToken: 'access' } },
    });

    await expect(postLogin({ account: 'developer', password: 'secret' })).rejects.toMatchObject({
      code: 'AUTH_INVALID_RESPONSE',
    });
  });
});
