import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '@/App';

describe('App', () => {
  it('routes to the projects screen and uses the safe browser fallback', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /build android automation/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Web preview')).toBeInTheDocument();
  });
});
