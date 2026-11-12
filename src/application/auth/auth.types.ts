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
