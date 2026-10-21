import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { AuthClient, LoginInput, SessionState } from '@application/auth/auth-session';
import { AuthProvider } from '@presentation/features/auth/AuthProvider';
import { LoginPage } from '@presentation/pages/LoginPage';

class FakeAuthClient implements AuthClient {
  readonly loginSpy = vi.fn<(input: LoginInput) => Promise<SessionState>>();

  restore(): Promise<SessionState> {
    return Promise.resolve({ status: 'signed-out' });
  }

  login(input: LoginInput): Promise<SessionState> {
    return this.loginSpy(input);
  }

  logout(): Promise<SessionState> {
    return Promise.resolve({ status: 'signed-out' });
  }
}

function renderLogin(client: FakeAuthClient) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/settings' } }]}>
      <AuthProvider client={client}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="settings" element={<h1>Settings destination</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('validates required credentials without calling the host', async () => {
    const client = new FakeAuthClient();
    renderLogin(client);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your account and password.');
    expect(client.loginSpy).not.toHaveBeenCalled();
  });

  it('submits credentials and returns to the guarded route', async () => {
    const client = new FakeAuthClient();
    client.loginSpy.mockResolvedValue({
      status: 'authenticated',
      account: 'developer@example.com',
      persistence: 'secure',
    });
    renderLogin(client);

    await userEvent.type(screen.getByLabelText('Account'), 'developer@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Settings destination' }),
    ).toBeInTheDocument();
    expect(client.loginSpy).toHaveBeenCalledWith({
      account: 'developer@example.com',
      password: 'secret',
    });
  });
});
