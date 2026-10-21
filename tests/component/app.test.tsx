import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppErrorBoundary } from '../../src/app/bootstrap/AppErrorBoundary';
import { AppProviders } from '../../src/app/providers/AppProviders';
import { AppRouter } from '../../src/app/router/AppRouter';

describe('App', () => {
  it('routes to the projects screen and uses the safe browser fallback', async () => {
    window.history.pushState({}, '', '/');

    render(
      <AppErrorBoundary>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </AppErrorBoundary>,
    );

    expect(
      await screen.findByRole('heading', { name: /build android automation/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Development session')).toBeInTheDocument();
  });
});
