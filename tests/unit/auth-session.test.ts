import { describe, expect, it, vi } from 'vitest';

import {
  AuthError,
  AuthSessionService,
  type AuthRemoteGateway,
  type RefreshTokenVault,
} from '@application/auth/auth-session';

function createDependencies() {
  const remote: AuthRemoteGateway = {
    login: vi.fn().mockResolvedValue({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    }),
  };
  const vault: RefreshTokenVault = {
    read: vi.fn().mockResolvedValue(null),
    replace: vi.fn().mockResolvedValue('secure'),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  return { remote, vault };
}

describe('AuthSessionService', () => {
  it('authenticates through the remote port and returns no tokens to the caller', async () => {
    const { remote, vault } = createDependencies();
    const service = new AuthSessionService(remote, vault, 'https://api.example.com');

    const session = await service.login({
      account: '  developer@example.com ',
      password: 'secret',
    });

    expect(remote.login).toHaveBeenCalledWith({
      account: 'developer@example.com',
      password: 'secret',
    });
    expect(vault.replace).toHaveBeenCalledWith(
      { server: 'https://api.example.com', account: 'developer@example.com' },
      'refresh-secret',
    );
    expect(session).toEqual({
      status: 'authenticated',
      account: 'developer@example.com',
      persistence: 'secure',
    });
    expect(session).not.toHaveProperty('accessToken');
    expect(session).not.toHaveProperty('refreshToken');
    expect(service.getAccessToken()).toBe('access-secret');
  });

  it('rejects invalid input before calling infrastructure', async () => {
    const { remote, vault } = createDependencies();
    const service = new AuthSessionService(remote, vault, 'https://api.example.com');

    await expect(service.login({ account: ' ', password: '' })).rejects.toMatchObject({
      code: 'AUTH_INVALID_INPUT',
    });
    expect(remote.login).not.toHaveBeenCalled();
  });

  it('clears both the in-memory session and secure credential on logout', async () => {
    const { remote, vault } = createDependencies();
    const service = new AuthSessionService(remote, vault, 'https://api.example.com');
    await service.login({ account: 'developer', password: 'secret' });

    await expect(service.logout()).resolves.toEqual({ status: 'signed-out' });
    expect(service.getAccessToken()).toBeNull();
    expect(vault.clear).toHaveBeenCalledOnce();
  });

  it('fails closed when secure credential persistence throws', async () => {
    const { remote, vault } = createDependencies();
    vi.mocked(vault.replace).mockRejectedValue(new Error('disk error'));
    const service = new AuthSessionService(remote, vault, 'https://api.example.com');

    await expect(service.login({ account: 'developer', password: 'secret' })).rejects.toEqual(
      new AuthError(
        'AUTH_CREDENTIAL_STORAGE_ERROR',
        'The secure credential store is unavailable.',
        true,
      ),
    );
    expect(service.getAccessToken()).toBeNull();
  });
});
