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
  | 'AUTH_SESSION_EXPIRED'
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
  refresh(refreshToken: string): Promise<AuthTokenPair>;
  logout(accessToken: string): Promise<void>;
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
  subscribe?(listener: (session: SessionState) => void): () => void;
}

export interface MainAuthSession extends AuthClient {
  getValidAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
  subscribe(listener: (session: SessionState) => void): () => void;
}

interface AuthSessionServiceOptions {
  now?: () => number;
  refreshSkewMs?: number;
  refreshRetryMs?: number;
}

const SIGNED_OUT = { status: 'signed-out' } as const;
const DEFAULT_REFRESH_SKEW_MS = 60_000;
const DEFAULT_REFRESH_RETRY_MS = 30_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function validateLoginInput(input: LoginInput): LoginInput {
  if (!input || typeof input.account !== 'string' || typeof input.password !== 'string') {
    throw new AuthError('AUTH_INVALID_INPUT', 'Enter a valid account and password.', false);
  }
  const account = input.account.trim();
  if (
    !account ||
    account.length > 500 ||
    input.password.length < 6 ||
    input.password.length > 1024
  ) {
    throw new AuthError('AUTH_INVALID_INPUT', 'Enter a valid account and password.', false);
  }
  return { account, password: input.password };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function accessTokenExpiresAt(accessToken: string): number {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3 || !parts[1]) throw new Error('Malformed JWT');
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    const exp = payload && typeof payload === 'object' ? Reflect.get(payload, 'exp') : undefined;
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0) {
      throw new Error('Invalid exp claim');
    }
    return exp * 1_000;
  } catch {
    throw new AuthError(
      'AUTH_INVALID_RESPONSE',
      'The authentication service returned an invalid access token.',
      true,
    );
  }
}

function validateTokenPair(tokens: AuthTokenPair): number {
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new AuthError(
      'AUTH_INVALID_RESPONSE',
      'The authentication service returned an invalid response.',
      true,
    );
  }
  return accessTokenExpiresAt(tokens.accessToken);
}

export class AuthSessionService implements MainAuthSession {
  private accessToken: string | null = null;
  private accessTokenExpiresAtMs = 0;
  private refreshCredential: StoredRefreshCredential | null = null;
  private session: SessionState = SIGNED_OUT;
  private refreshPromise: Promise<string | null> | null = null;
  private restorePromise: Promise<SessionState> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sessionListeners = new Set<(session: SessionState) => void>();
  private readonly remote: AuthRemoteGateway;
  private readonly vault: RefreshTokenVault;
  private readonly serverScope: string;
  private readonly now: () => number;
  private readonly refreshSkewMs: number;
  private readonly refreshRetryMs: number;

  constructor(
    remote: AuthRemoteGateway,
    vault: RefreshTokenVault,
    serverScope: string,
    options: AuthSessionServiceOptions = {},
  ) {
    this.remote = remote;
    this.vault = vault;
    this.serverScope = serverScope;
    this.now = options.now ?? Date.now;
    this.refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
    this.refreshRetryMs = options.refreshRetryMs ?? DEFAULT_REFRESH_RETRY_MS;
  }

  restore(): Promise<SessionState> {
    if (this.session.status === 'authenticated' && this.refreshCredential) {
      return Promise.resolve(this.session);
    }
    if (this.restorePromise) return this.restorePromise;

    this.restorePromise = this.restoreStoredSession().finally(() => {
      this.restorePromise = null;
    });
    return this.restorePromise;
  }

  private async restoreStoredSession(): Promise<SessionState> {
    const credential = this.refreshCredential ?? (await this.vault.read());
    if (!credential) {
      this.clearMemorySession();
      return this.session;
    }

    this.refreshCredential = credential;
    this.session = {
      status: 'authenticated',
      account: credential.scope.account,
      persistence: 'secure',
    };

    if (this.serverScope === 'unconfigured' || credential.scope.server !== this.serverScope) {
      return this.session;
    }

    try {
      await this.refreshAccessToken();
    } catch (error) {
      const mapped = toAuthError(error);
      if (mapped.code === 'AUTH_SESSION_EXPIRED') return this.session;
      if (!mapped.retryable) {
        throw mapped;
      }
      this.scheduleRefreshRetry();
    }
    return this.session;
  }

  async login(input: LoginInput): Promise<SessionState> {
    const credentials = validateLoginInput(input);
    const tokens = await this.remote.login(credentials);
    const expiresAt = validateTokenPair(tokens);
    const scope = { server: this.serverScope, account: credentials.account };

    let persistence: SessionPersistence;
    try {
      persistence = await this.vault.replace(scope, tokens.refreshToken);
    } catch {
      throw new AuthError(
        'AUTH_CREDENTIAL_STORAGE_ERROR',
        'The secure credential store is unavailable.',
        true,
      );
    }

    this.activateSession(scope, tokens, expiresAt, persistence);
    return this.session;
  }

  async getValidAccessToken(): Promise<string | null> {
    if (this.session.status !== 'authenticated' || !this.refreshCredential) {
      await this.restore();
    }
    if (this.session.status !== 'authenticated' || !this.refreshCredential) return null;

    if (this.accessToken && this.accessTokenExpiresAtMs - this.refreshSkewMs > this.now()) {
      return this.accessToken;
    }
    return this.refreshAccessToken();
  }

  refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.rotateTokens().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  subscribe(listener: (session: SessionState) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  private async rotateTokens(): Promise<string | null> {
    const credential = this.refreshCredential ?? (await this.vault.read());
    if (!credential) {
      this.clearMemorySession();
      return null;
    }
    if (this.serverScope === 'unconfigured' || credential.scope.server !== this.serverScope) {
      this.refreshCredential = credential;
      return null;
    }

    this.refreshCredential = credential;
    try {
      const tokens = await this.remote.refresh(credential.refreshToken);
      const expiresAt = validateTokenPair(tokens);
      let persistence: SessionPersistence = 'session-only';
      try {
        persistence = await this.vault.replace(credential.scope, tokens.refreshToken);
      } catch {
        // The server has already invalidated the old refresh token. Keep the rotated
        // credential in memory so the active session can continue, and discard stale disk state.
        try {
          await this.vault.clear();
        } catch {
          // The session remains memory-only until the next successful login.
        }
      }
      this.activateSession(credential.scope, tokens, expiresAt, persistence);
      return tokens.accessToken;
    } catch (error) {
      const mapped = toAuthError(error);
      if (mapped.code === 'AUTH_SESSION_EXPIRED') await this.invalidateSession();
      throw mapped;
    }
  }

  async logout(): Promise<SessionState> {
    try {
      const accessToken = await this.getValidAccessToken();
      if (accessToken) await this.remote.logout(accessToken);
    } catch {
      // Server logout is best effort; local credentials are always cleared below.
    }

    this.clearMemorySession();
    try {
      await this.vault.clear();
    } catch {
      throw new AuthError(
        'AUTH_CREDENTIAL_STORAGE_ERROR',
        'The local credential could not be removed.',
        true,
      );
    }
    return this.session;
  }

  private activateSession(
    scope: AuthScope,
    tokens: AuthTokenPair,
    expiresAt: number,
    persistence: SessionPersistence,
  ) {
    this.accessToken = tokens.accessToken;
    this.accessTokenExpiresAtMs = expiresAt;
    this.refreshCredential = { scope, refreshToken: tokens.refreshToken };
    this.session = { status: 'authenticated', account: scope.account, persistence };
    this.scheduleRefresh();
    this.notifySessionChanged();
  }

  private scheduleRefresh() {
    this.clearRefreshTimer();
    const delay = Math.max(0, this.accessTokenExpiresAtMs - this.refreshSkewMs - this.now());
    if (delay > MAX_TIMER_DELAY_MS) {
      this.refreshTimer = setTimeout(() => this.scheduleRefresh(), MAX_TIMER_DELAY_MS);
      return;
    }
    this.refreshTimer = setTimeout(() => {
      void this.refreshAccessToken().catch((error: unknown) => {
        if (toAuthError(error).retryable && this.session.status === 'authenticated') {
          this.scheduleRefreshRetry();
        }
      });
    }, delay);
  }

  private scheduleRefreshRetry() {
    this.clearRefreshTimer();
    this.refreshTimer = setTimeout(() => {
      void this.refreshAccessToken().catch((error: unknown) => {
        if (toAuthError(error).retryable && this.session.status === 'authenticated') {
          this.scheduleRefreshRetry();
        }
      });
    }, this.refreshRetryMs);
  }

  private async invalidateSession() {
    this.clearMemorySession();
    try {
      await this.vault.clear();
    } catch {
      throw new AuthError(
        'AUTH_CREDENTIAL_STORAGE_ERROR',
        'The invalid credential could not be removed.',
        true,
      );
    }
  }

  private clearMemorySession() {
    this.clearRefreshTimer();
    this.accessToken = null;
    this.accessTokenExpiresAtMs = 0;
    this.refreshCredential = null;
    this.session = SIGNED_OUT;
    this.notifySessionChanged();
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private notifySessionChanged() {
    for (const listener of this.sessionListeners) listener(this.session);
  }
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  return new AuthError('AUTH_UNKNOWN_ERROR', 'Authentication failed unexpectedly.', true);
}
