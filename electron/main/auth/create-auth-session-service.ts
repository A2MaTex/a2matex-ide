import {
  AuthSessionService,
  type AuthClient,
  type AuthRemoteGateway,
  type SessionState,
} from '../../../src/application/auth/auth-session.js';
import { createAuthApi } from '../api/auth-api.js';
import { configureApiRequest } from '../api/request.js';
import { SecureRefreshTokenVault } from '../adapters/auth/secure-refresh-token-vault.js';
import { loadApiConfig } from '../config/api-config.js';

export interface MainAuthClient extends AuthClient {
  getAccessToken(): string | null;
}

class UnavailableAuthGateway implements AuthRemoteGateway {
  constructor(private readonly configurationError: unknown) {}

  login(): Promise<never> {
    return Promise.reject(this.configurationError);
  }
}

class E2EAuthClient implements MainAuthClient {
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
    return Promise.resolve(this.session);
  }

  logout(): Promise<SessionState> {
    this.session = { status: 'signed-out' };
    return Promise.resolve(this.session);
  }

  getAccessToken(): string | null {
    return this.session.status === 'authenticated' ? 'e2e-access-token' : null;
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
