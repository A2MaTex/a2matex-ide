import axios from 'axios';
import { z } from 'zod';

import type { PolicyId, PolicyManifest } from '@application/onboarding/policy-manifest';
import { OnboardingError } from '@electron/main/services/onboarding-state-service';

const MAX_POLICY_BYTES = 512 * 1024;
const policySchema = z
  .object({
    data: z
      .object({
        id: z.string().uuid(),
        type: z.enum(['CUSTOMER_TERMS', 'PRIVACY_POLICY']),
        version: z.string().min(1).max(100),
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(MAX_POLICY_BYTES),
        publishedAt: z.string().datetime(),
      })
      .strict(),
    statusCode: z.literal(200),
  })
  .strict();

const policyTypes = [
  { type: 'CUSTOMER_TERMS', id: 'terms' },
  { type: 'PRIVACY_POLICY', id: 'privacy' },
] as const satisfies ReadonlyArray<{ type: string; id: PolicyId }>;

export async function getCurrentPolicies(
  baseUrl: string,
  timeoutMs: number,
): Promise<PolicyManifest> {
  try {
    const documents = await Promise.all(
      policyTypes.map(async ({ type, id }) => {
        const response = await axios.get(`${baseUrl}/api/v1/terms/current`, {
          params: { type },
          headers: { Accept: 'application/json' },
          timeout: timeoutMs,
          maxContentLength: MAX_POLICY_BYTES,
        });
        const parsed = policySchema.safeParse(response.data);
        if (!parsed.success || parsed.data.data.type !== type) {
          throw new OnboardingError(
            'ONBOARDING_POLICY_UNAVAILABLE',
            'The policy service returned an invalid document.',
            true,
          );
        }
        const policy = parsed.data.data;
        return {
          id,
          title: policy.title,
          version: policy.version,
          url: `${baseUrl}/api/v1/terms/current?type=${type}`,
          contentHtml: policy.content,
          publishedAt: policy.publishedAt,
          required: true,
        } as const;
      }),
    );
    return { configured: true, error: null, documents };
  } catch (error) {
    if (error instanceof OnboardingError) throw error;
    throw new OnboardingError(
      'ONBOARDING_POLICY_UNAVAILABLE',
      'Current Terms and Privacy could not be loaded. Check your connection and retry.',
      true,
    );
  }
}
