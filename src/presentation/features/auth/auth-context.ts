import { createContext } from 'react';

import type { AuthError, LoginInput, SessionState } from '@application/auth/auth-session';

export interface AuthContextValue {
  session: SessionState;
  status: 'restoring' | 'idle' | 'submitting';
  error: AuthError | null;
  login(input: LoginInput): Promise<SessionState>;
  logout(): Promise<void>;
  clearError(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
