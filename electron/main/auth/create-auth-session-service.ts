import {
  AuthSessionService,
  type AuthClient,
  type AuthRemoteGateway,
  type SessionState,
} from '@application/auth/auth-session';
import { SecureRefreshTokenVault } from '@electron/main/adapters/auth/secure-refresh-token-vault';
import { createAuthApi } from '@electron/main/api/auth.api';
import { configureApiRequest } from '@electron/main/api/request';
import { loadApiConfig } from '@electron/main/config/api-config';

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
