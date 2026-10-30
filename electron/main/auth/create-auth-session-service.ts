import {
  AuthSessionService,
  type MainAuthSession,
  type AuthRemoteGateway,
  type SessionState,
} from '@application/auth/auth-session';
import { SecureRefreshTokenVault } from '@electron/main/adapters/auth/secure-refresh-token-vault';
import { createAuthApi } from '@electron/main/api/auth.api';
import { configureApiRequest } from '@electron/main/api/request';
import { loadApiConfig } from '@electron/main/config/api-config';

export type MainAuthClient = MainAuthSession;

class UnavailableAuthGateway implements AuthRemoteGateway {
  constructor(private readonly configurationError: unknown) {}

  login(): Promise<never> {
    return Promise.reject(this.configurationError);
  }

  refresh(): Promise<never> {
    return Promise.reject(this.configurationError);
  }

  logout(): Promise<never> {
    return Promise.reject(this.configurationError);
  }
}

class E2EAuthClient implements MainAuthClient {
  private readonly listeners = new Set<(session: SessionState) => void>();
  private session: SessionState = {
    status: 'authenticated',
    account: 'E2E developer',
    persistence: 'session-only',
  };

  restore(): Promise<SessionState> {
    return Promise.resolve(this.session);
  }

  login(): Promise<SessionState> {
    this.session = {
      status: 'authenticated',
      account: 'E2E developer',
      persistence: 'session-only',
    };
    this.notify();
    return Promise.resolve(this.session);
  }

  logout(): Promise<SessionState> {
    this.session = { status: 'signed-out' };
    this.notify();
    return Promise.resolve(this.session);
  }

  getValidAccessToken(): Promise<string | null> {
    return Promise.resolve(this.session.status === 'authenticated' ? 'e2e-access-token' : null);
  }

  refreshAccessToken(): Promise<string | null> {
    return this.getValidAccessToken();
  }

  subscribe(listener: (session: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener(this.session);
  }
}

export function createAuthSessionService(input: {
  appPath: string;
  userDataPath: string;
  isPackaged: boolean;
}): MainAuthClient {
  if (process.env.A2MATEX_E2E === '1') return new E2EAuthClient();

  const vault = new SecureRefreshTokenVault(input.userDataPath);

  try {
    const config = loadApiConfig({ appPath: input.appPath, isPackaged: input.isPackaged });
    configureApiRequest(config.baseUrl, config.timeoutMs);
    return new AuthSessionService(createAuthApi(), vault, config.baseUrl);
  } catch (error) {
    return new AuthSessionService(new UnavailableAuthGateway(error), vault, 'unconfigured');
  }
}
