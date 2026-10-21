export interface LoginInput {
  account: string;
  password: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthScope {
  server: string;
  account: string;
}

export interface StoredRefreshCredential {
  scope: AuthScope;
  refreshToken: string;
}

export type SessionPersistence = 'secure' | 'session-only';

export type SessionState =
  | { status: 'signed-out' }
  | {
      status: 'authenticated';
      account: string;
      persistence: SessionPersistence;
    };

export type AuthErrorCode =
  | 'AUTH_INVALID_INPUT'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_NETWORK_UNAVAILABLE'
  | 'AUTH_TIMEOUT'
  | 'AUTH_SERVER_ERROR'
  | 'AUTH_INVALID_RESPONSE'
  | 'AUTH_CONFIGURATION_ERROR'
  | 'AUTH_CREDENTIAL_STORAGE_ERROR'
  | 'AUTH_UNKNOWN_ERROR';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly retryable: boolean;

  constructor(code: AuthErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AuthRemoteGateway {
  login(input: LoginInput): Promise<AuthTokenPair>;
}

export interface RefreshTokenVault {
  read(): Promise<StoredRefreshCredential | null>;
  replace(scope: AuthScope, refreshToken: string): Promise<SessionPersistence>;
  clear(): Promise<void>;
}

export interface AuthClient {
  restore(): Promise<SessionState>;
  login(input: LoginInput): Promise<SessionState>;
  logout(): Promise<SessionState>;
}

const SIGNED_OUT = { status: 'signed-out' } as const;

function validateLoginInput(input: LoginInput): LoginInput {
  if (!input || typeof input.account !== 'string' || typeof input.password !== 'string') {
    throw new AuthError('AUTH_INVALID_INPUT', 'Enter a valid account and password.', false);
  }
  const account = input.account.trim();
  if (!account || account.length > 320 || !input.password || input.password.length > 1024) {
    throw new AuthError('AUTH_INVALID_INPUT', 'Enter a valid account and password.', false);
  }
  return { account, password: input.password };
}

export class AuthSessionService implements AuthClient {
  private accessToken: string | null = null;
  private session: SessionState = SIGNED_OUT;
  private readonly remote: AuthRemoteGateway;
  private readonly vault: RefreshTokenVault;
  private readonly serverScope: string;

  constructor(remote: AuthRemoteGateway, vault: RefreshTokenVault, serverScope: string) {
    this.remote = remote;
    this.vault = vault;
    this.serverScope = serverScope;
  }

  async restore(): Promise<SessionState> {
    return this.session;
  }

  async login(input: LoginInput): Promise<SessionState> {
    const credentials = validateLoginInput(input);
    const tokens = await this.remote.login(credentials);

    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new AuthError(
        'AUTH_INVALID_RESPONSE',
        'The authentication service returned an invalid response.',
        true,
      );
    }

    let persistence: SessionPersistence;
    try {
      persistence = await this.vault.replace(
        { server: this.serverScope, account: credentials.account },
        tokens.refreshToken,
      );
    } catch {
      throw new AuthError(
        'AUTH_CREDENTIAL_STORAGE_ERROR',
        'The secure credential store is unavailable.',
        true,
      );
    }

    this.accessToken = tokens.accessToken;
    this.session = {
      status: 'authenticated',
      account: credentials.account,
      persistence,
    };
    return this.session;
  }

  async logout(): Promise<SessionState> {
    this.accessToken = null;
    this.session = SIGNED_OUT;
    await this.vault.clear();
    return this.session;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  return new AuthError('AUTH_UNKNOWN_ERROR', 'Authentication failed unexpectedly.', true);
}
