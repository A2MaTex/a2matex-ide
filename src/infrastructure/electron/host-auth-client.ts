import {
  AuthError,
  type AuthClient,
  type AuthErrorCode,
  type LoginInput,
  type SessionState,
} from '@application/auth/auth-session';

import type { HostResult } from '@infrastructure/electron/studio-host-api';

function unwrap(result: HostResult<SessionState, AuthErrorCode>): SessionState {
  if (result.ok) return result.value;
  throw new AuthError(result.error.code, result.error.message, result.error.retryable);
}

class BrowserDevelopmentAuthClient implements AuthClient {
  private session: SessionState = {
    status: 'authenticated',
    account: 'Development session',
    persistence: 'session-only',
  };

  restore(): Promise<SessionState> {
    return Promise.resolve(this.session);
  }

  login(input: LoginInput): Promise<SessionState> {
    if (!input.account.trim() || !input.password) {
      throw new AuthError('AUTH_INVALID_INPUT', 'Enter an account and password.', false);
    }
    this.session = {
      status: 'authenticated',
      account: input.account.trim(),
      persistence: 'session-only',
    };
    return Promise.resolve(this.session);
  }

  logout(): Promise<SessionState> {
    this.session = { status: 'signed-out' };
    return Promise.resolve(this.session);
  }
}

class MissingHostAuthClient implements AuthClient {
  restore(): Promise<SessionState> {
    return Promise.resolve({ status: 'signed-out' });
  }

  login(): Promise<SessionState> {
    throw new AuthError(
      'AUTH_CONFIGURATION_ERROR',
      'The secure desktop authentication host is unavailable.',
      false,
    );
  }

  logout(): Promise<SessionState> {
    return Promise.resolve({ status: 'signed-out' });
  }
}

export class HostAuthClient implements AuthClient {
  private readonly fallback: AuthClient = import.meta.env.DEV
    ? new BrowserDevelopmentAuthClient()
    : new MissingHostAuthClient();

  async restore(): Promise<SessionState> {
    if (!window.studioHost) return this.fallback.restore();
    return unwrap(await window.studioHost.auth.restore());
  }

  async login(input: LoginInput): Promise<SessionState> {
    if (!window.studioHost) return this.fallback.login(input);
    return unwrap(await window.studioHost.auth.login(input));
  }

  async logout(): Promise<SessionState> {
    if (!window.studioHost) return this.fallback.logout();
    return unwrap(await window.studioHost.auth.logout());
  }

  subscribe(listener: (session: SessionState) => void): () => void {
    if (!window.studioHost) return () => undefined;
    return window.studioHost.auth.onSessionChanged(listener);
  }
}

export const hostAuthClient = new HostAuthClient();
