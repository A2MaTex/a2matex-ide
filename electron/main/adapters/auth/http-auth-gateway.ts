import { z } from 'zod';

import {
  AuthError,
  type AuthRemoteGateway,
  type AuthTokenPair,
  type LoginInput,
} from '../../../../src/application/auth/auth-session.js';

const authTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

const loginResponseSchema = z
  .union([
    authTokenPairSchema,
    z.object({
      data: authTokenPairSchema,
      statusCode: z.number().int(),
    }),
  ])
  .transform((response) => ('data' in response ? response.data : response));

type FetchLike = typeof fetch;

export class HttpAuthGateway implements AuthRemoteGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async login(input: LoginInput): Promise<AuthTokenPair> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(new URL('/api/v1/auth/login', this.baseUrl), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: input.account, password: input.password }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403 || response.status === 422) {
        throw new AuthError(
          'AUTH_INVALID_CREDENTIALS',
          'The account or password is incorrect.',
          false,
        );
      }
      if (!response.ok) {
        throw new AuthError(
          'AUTH_SERVER_ERROR',
          response.status >= 500
            ? 'The authentication service is temporarily unavailable.'
            : 'The authentication request was rejected.',
          response.status >= 500 || response.status === 429,
        );
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new AuthError(
          'AUTH_INVALID_RESPONSE',
          'The authentication service returned invalid JSON.',
          true,
        );
      }

      const parsed = loginResponseSchema.safeParse(payload);
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
      if (controller.signal.aborted) {
        throw new AuthError('AUTH_TIMEOUT', 'The login request timed out.', true);
      }
      throw new AuthError(
        'AUTH_NETWORK_UNAVAILABLE',
        'Unable to reach the authentication service.',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
