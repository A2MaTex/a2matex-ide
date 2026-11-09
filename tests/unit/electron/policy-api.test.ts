import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { getCurrentPolicies } from '@electron/main/api/policy.api';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

const get = vi.mocked(axios.get);

describe('policy API', () => {
  it('maps customer terms and privacy to the onboarding manifest', async () => {
    get.mockImplementation(async (_url, config) => {
      const type = config?.params?.type as 'CUSTOMER_TERMS' | 'PRIVACY_POLICY';
      return {
        data: {
          data: {
            id:
              type === 'CUSTOMER_TERMS'
                ? '8e211bc3-2866-43ec-9c73-4c740b40010b'
                : '78d74d42-6485-4ef0-8f50-c40bbb6673b1',
            type,
            version: type === 'CUSTOMER_TERMS' ? 'v1.1.0' : 'v1.2.1',
            title: type === 'CUSTOMER_TERMS' ? 'Terms for Customer' : 'A2MaTeX Privacy Policy',
            content: '<p>Policy</p>',
            publishedAt: '2026-10-23T10:40:41.173Z',
          },
          statusCode: 200,
        },
      } as never;
    });

    const manifest = await getCurrentPolicies('https://api.a2matex.com', 10_000);

    expect(manifest.configured).toBe(true);
    expect(manifest.documents.map(({ id, version }) => ({ id, version }))).toEqual([
      { id: 'terms', version: 'v1.1.0' },
      { id: 'privacy', version: 'v1.2.1' },
    ]);
  });
});
