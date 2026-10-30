import axios from 'axios';

import {
  AuthError,
  type AuthRemoteGateway,
  type AuthTokenPair,
  type LoginInput,
} from '@application/auth/auth-session';
import request from '@electron/main/api/request';
import { loginResponseSchema } from './schema/login.schema.js';
import { logoutResponseSchema } from './schema/logout.schema.js';

type AuthOperation = 'login' | 'logout' | 'refresh';

function mapAuthRequestError(error: unknown, operation: AuthOperation): AuthError {
  if (error instanceof AuthError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (operation === 'login' && (status === 401 || status === 403 || status === 422)) {
      return new AuthError(
        'AUTH_INVALID_CREDENTIALS',
        'The account or password is incorrect.',
        false,
      );
    }
    if (
      operation === 'refresh' &&
      (status === 400 || status === 401 || status === 403 || status === 422)
    ) {
      return new AuthError('AUTH_SESSION_EXPIRED', 'The saved session is no longer valid.', false);
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new AuthError('AUTH_TIMEOUT', `The ${operation} request timed out.`, true);
    }
    if (status !== undefined) {
      return new AuthError(
        'AUTH_SERVER_ERROR',
        status >= 500
          ? 'The authentication service is temporarily unavailable.'
          : `The ${operation} request was rejected.`,
        status >= 500 || status === 429,
      );
    }
  }

  return new AuthError(
    'AUTH_NETWORK_UNAVAILABLE',
    'Unable to reach the authentication service.',
    true,
  );
}

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
    throw mapAuthRequestError(error, 'login');
  }
}

export async function refresh(refreshToken: string): Promise<AuthTokenPair> {
  try {
    const response = await request({
      url: '/api/v1/auth/refresh-token',
      method: 'POST',
      data: { refreshToken },
    });
    const parsed = loginResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AuthError(
        'AUTH_INVALID_RESPONSE',
        'The refresh response is missing required tokens.',
        true,
      );
    }
    return parsed.data;
  } catch (error) {
    throw mapAuthRequestError(error, 'refresh');
  }
}

export async function logout(accessToken: string): Promise<void> {
  try {
    const response = await request({
      url: '/api/v1/auth/logout',
      method: 'POST',
      data: {},
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!logoutResponseSchema.safeParse(response.data).success) {
      throw new AuthError('AUTH_INVALID_RESPONSE', 'The logout response is invalid.', false);
    }
  } catch (error) {
    throw mapAuthRequestError(error, 'logout');
  }
}

export function createAuthApi(): AuthRemoteGateway {
  return {
    login: (data) => login(data),
    refresh: (refreshToken) => refresh(refreshToken),
    logout: (accessToken) => logout(accessToken),
  };
}
