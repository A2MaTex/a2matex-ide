import { useContext } from 'react';

import { AuthContext } from '@presentation/features/auth/auth-context';

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
