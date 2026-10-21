import {
  AuthSessionService,
  type AuthClient,
  type AuthRemoteGateway,
  type SessionState,
} from '../../../src/application/auth/auth-session.js';
import { HttpAuthGateway } from '../adapters/auth/http-auth-gateway.js';
import { SecureRefreshTokenVault } from '../adapters/auth/secure-refresh-token-vault.js';
import { loadApiConfig } from '../config/api-config.js';

class UnavailableAuthGateway implements AuthRemoteGateway {
  constructor(private readonly configurationError: unknown) {}

  login(): Promise<never> {
    return Promise.reject(this.configurationError);
  }
}

class E2EAuthClient implements AuthClient {
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
}

export function createAuthSessionService(input: {
  appPath: string;
  userDataPath: string;
  isPackaged: boolean;
}) {
  if (process.env.A2MATEX_E2E === '1') return new E2EAuthClient();

  const vault = new SecureRefreshTokenVault(input.userDataPath);

  try {
    const config = loadApiConfig({ appPath: input.appPath, isPackaged: input.isPackaged });
    return new AuthSessionService(
      new HttpAuthGateway(config.baseUrl, config.timeoutMs),
      vault,
      config.baseUrl,
    );
  } catch (error) {
    return new AuthSessionService(new UnavailableAuthGateway(error), vault, 'unconfigured');
  }
}
