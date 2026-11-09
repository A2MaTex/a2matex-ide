export type PolicyId = 'terms' | 'privacy';

export interface PolicyDocument {
  id: PolicyId;
  title: string;
  version: string;
  url: string;
  contentHtml?: string;
  publishedAt?: string;
  required: true;
}

export interface PolicyManifest {
  documents: PolicyDocument[];
  configured: boolean;
  error: string | null;
}

interface PolicyEnvironment {
  VITE_TERMS_VERSION?: string;
  VITE_TERMS_URL?: string;
  VITE_PRIVACY_VERSION?: string;
  VITE_PRIVACY_URL?: string;
}

export function isTrustedPolicyUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'a2matex.com' || url.hostname.endsWith('.a2matex.com'))
    );
  } catch {
    return false;
  }
}

export function createPolicyManifest(environment: PolicyEnvironment): PolicyManifest {
  const inputs = [
    {
      id: 'terms' as const,
      title: 'Terms of Service',
      version: environment.VITE_TERMS_VERSION?.trim() ?? '',
      url: environment.VITE_TERMS_URL?.trim() ?? '',
    },
    {
      id: 'privacy' as const,
      title: 'Privacy Policy',
      version: environment.VITE_PRIVACY_VERSION?.trim() ?? '',
      url: environment.VITE_PRIVACY_URL?.trim() ?? '',
    },
  ];
  const configured = inputs.every(
    (policy) => Boolean(policy.version) && isTrustedPolicyUrl(policy.url),
  );

  return {
    configured,
    error: configured ? null : 'Terms and Privacy must have a version and a trusted HTTPS URL.',
    documents: inputs.map((policy) => ({ ...policy, required: true })),
  };
}
