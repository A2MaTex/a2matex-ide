import axios from 'axios';
import { z } from 'zod';

import {
  AuthError,
  type AuthRemoteGateway,
  type AuthTokenPair,
  type LoginInput,
} from '@application/auth/auth-session';
import request from '@electron/main/api/request';

const loginResponseSchema = z
  .union([
    z.object({
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
    }),
    z.object({
      data: z.object({
        accessToken: z.string().min(1),
        refreshToken: z.string().min(1),
      }),
      statusCode: z.number().int(),
    }),
  ])
  .transform((response) => ('data' in response ? response.data : response));

export async function login(data: LoginInput): Promise<AuthTokenPair> {
  try {
    const response = await request({
      url: '/api/v1/auth/login',
      method: 'POST',
      data,
    });
    const parsed = loginResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AuthError(
        'AUTH_INVALID_RESPONSE',
        'The authentication response is missing required tokens.',
        true,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof AuthError) throw error;

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403 || status === 422) {
        throw new AuthError(
          'AUTH_INVALID_CREDENTIALS',
          'The account or password is incorrect.',
          false,
        );
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new AuthError('AUTH_TIMEOUT', 'The login request timed out.', true);
      }
      if (status !== undefined) {
        throw new AuthError(
          'AUTH_SERVER_ERROR',
          status >= 500
            ? 'The authentication service is temporarily unavailable.'
            : 'The authentication request was rejected.',
          status >= 500 || status === 429,
        );
      }
    }

    throw new AuthError(
      'AUTH_NETWORK_UNAVAILABLE',
      'Unable to reach the authentication service.',
      true,
    );
  }
}

export function createAuthApi(): AuthRemoteGateway {
  return { login: (data) => login(data) };
}
