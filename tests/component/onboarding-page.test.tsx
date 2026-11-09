import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { PolicyManifest } from '@application/onboarding/policy-manifest';
import { OnboardingPage } from '@presentation/pages/OnboardingPage';

const manifest: PolicyManifest = {
  configured: true,
  error: null,
  documents: [
    {
      id: 'terms',
      title: 'Terms of Service',
      version: '2026-11',
      url: 'https://www.a2matex.com/terms',
      required: true,
    },
    {
      id: 'privacy',
      title: 'Privacy Policy',
      version: '2026-11',
      url: 'https://www.a2matex.com/privacy',
      required: true,
    },
  ],
};

function renderPage(policyManifest = manifest) {
  return render(
    <MemoryRouter>
      <OnboardingPage manifest={policyManifest} />
    </MemoryRouter>,
  );
}

describe('onboarding steps', () => {
  it('moves from Welcome to Policies and keeps every choice unchecked by default', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: /build android workflows/i })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Get started' }));

    const terms = screen.getByRole('checkbox', { name: /accept the Terms of Service/i });
    const privacy = screen.getByRole('checkbox', { name: /accept the Privacy Policy/i });
    const analytics = screen.getByRole('checkbox', { name: /optional usage analytics/i });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(terms).not.toBeChecked();
    expect(privacy).not.toBeChecked();
    expect(analytics).not.toBeChecked();
    expect(continueButton).toBeDisabled();

    await user.click(terms);
    await user.click(privacy);
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(screen.getByRole('heading', { name: /choose an export location/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: /optional android setup/i })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Set up later' }));

    expect(screen.getByRole('heading', { name: /ready to finish/i })).toHaveFocus();
    expect(screen.getByText('Ask when exporting')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('blocks acceptance when the policy manifest is unavailable', async () => {
    const user = userEvent.setup();
    renderPage({
      configured: false,
      error: 'Missing policy versions.',
      documents: manifest.documents,
    });
    await user.click(screen.getByRole('button', { name: 'Get started' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Missing policy versions.');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
