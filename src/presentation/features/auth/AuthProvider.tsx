import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  toAuthError,
  type AuthClient,
  type AuthError,
  type LoginInput,
  type SessionState,
} from '@application/auth/auth-session';

import { AuthContext } from '@presentation/features/auth/auth-context';

interface AuthProviderProps {
  children: ReactNode;
  client: AuthClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const [session, setSession] = useState<SessionState>({ status: 'signed-out' });
  const [status, setStatus] = useState<'restoring' | 'idle' | 'submitting'>('restoring');
  const [error, setError] = useState<AuthError | null>(null);

  useEffect(() => {
    let active = true;
    client
      .restore()
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSession({ status: 'signed-out' });
        setError(toAuthError(reason));
      })
      .finally(() => {
        if (active) setStatus('idle');
      });
    return () => {
      active = false;
    };
  }, [client]);

  const login = useCallback(
    async (input: LoginInput) => {
      setStatus('submitting');
      setError(null);
      try {
        const nextSession = await client.login(input);
        setSession(nextSession);
        return nextSession;
      } catch (reason) {
        const nextError = toAuthError(reason);
        setError(nextError);
        throw nextError;
      } finally {
        setStatus('idle');
      }
    },
    [client],
  );

  const logout = useCallback(async () => {
    setStatus('submitting');
    setError(null);
    try {
      setSession(await client.logout());
    } catch (reason) {
      setSession({ status: 'signed-out' });
      setError(toAuthError(reason));
    } finally {
      setStatus('idle');
    }
  }, [client]);

  const clearError = useCallback(() => setError(null), []);
  const value = useMemo(
    () => ({ session, status, error, login, logout, clearError }),
    [session, status, error, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
