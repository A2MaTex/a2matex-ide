import { describe, expect, it } from 'vitest';

import { createPolicyManifest, isTrustedPolicyUrl } from '@application/onboarding/policy-manifest';

describe('onboarding policy manifest', () => {
  it('requires versioned policies on trusted HTTPS hosts', () => {
    const manifest = createPolicyManifest({
      VITE_TERMS_VERSION: '2026-11',
      VITE_TERMS_URL: 'https://www.a2matex.com/terms',
      VITE_PRIVACY_VERSION: '2026-11',
      VITE_PRIVACY_URL: 'https://legal.a2matex.com/privacy',
    });

    expect(manifest.configured).toBe(true);
    expect(manifest.documents).toHaveLength(2);
  });

  it('rejects untrusted or incomplete policy configuration', () => {
    expect(isTrustedPolicyUrl('http://a2matex.com/terms')).toBe(false);
    expect(isTrustedPolicyUrl('https://a2matex.com.evil.test/terms')).toBe(false);
    expect(
      createPolicyManifest({
        VITE_TERMS_VERSION: '',
        VITE_TERMS_URL: 'https://www.a2matex.com/terms',
      }).configured,
    ).toBe(false);
  });
});
