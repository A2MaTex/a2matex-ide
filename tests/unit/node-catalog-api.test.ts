import { afterEach, describe, expect, it, vi } from 'vitest';

import { getNodeCatalog } from '../../electron/main/api/node-catalog-api';
import { instanceAxios } from '../../electron/main/api/request';

const catalogHash = 'a'.repeat(64);
const remoteNode = {
  type: 'android.tap',
  name: 'Tap',
  description: 'Tap an absolute coordinate on the selected Android device.',
  category: 'ANDROID',
  runtimeHandler: 'android.tap',
  minimumRuntimeVersion: '0.1.0',
  defaultTimeoutMs: 1000,
  configSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  outputPorts: { ports: [{ key: 'success', kind: 'CONTROL', label: 'Success' }] },
  editorHints: { icon: 'play', fieldOrder: [] },
  supportedErrorPolicies: { supported: ['STOP'] },
  capabilities: [],
};

const flowNode = {
  ...remoteNode,
  type: 'flow.start',
  name: 'Start',
  description: 'Start workflow execution.',
  category: 'FLOW',
  runtimeHandler: 'flow.start',
};

function axiosError(status?: number, code?: string) {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    code,
    response: status === undefined ? undefined : { status },
  });
}

describe('node catalog API', () => {
  afterEach(() => vi.restoreAllMocks());
  it('gets and normalizes the backend response', async () => {
    const request = vi.spyOn(instanceAxios, 'request').mockResolvedValue({
      status: 200,
      data: { data: { catalogHash, nodes: [remoteNode, flowNode] }, statusCode: 200 },
    });

    await expect(
      getNodeCatalog({
        accessToken: 'secret',
        runtimeVersion: '0.1.0',
      }),
    ).resolves.toMatchObject({
      status: 'modified',
      catalogHash,
      nodes: [
        { type: 'android.tap', displayName: 'Tap', description: remoteNode.description },
        { type: 'flow.start', displayName: 'Start', description: flowNode.description },
      ],
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/node-catalog',
        method: 'GET',
        params: { runtimeVersion: '0.1.0' },
        headers: { Authorization: 'Bearer secret' },
      }),
    );
  });

  it('sends If-None-Match and accepts 304', async () => {
    const request = vi.spyOn(instanceAxios, 'request').mockResolvedValue({ status: 304, data: '' });

    await expect(
      getNodeCatalog({
        accessToken: 'secret',
        runtimeVersion: '0.1.0',
        catalogHash,
      }),
    ).resolves.toEqual({ status: 'not-modified' });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer secret',
          'If-None-Match': `"${catalogHash}"`,
        },
      }),
    );
  });

  it('rejects an invalid payload', async () => {
    vi.spyOn(instanceAxios, 'request').mockResolvedValue({
      status: 200,
      data: {
        data: { catalogHash, nodes: [{ ...remoteNode, runtimeHandler: '' }] },
        statusCode: 200,
      },
    });

    await expect(
      getNodeCatalog({
        accessToken: 'secret',
        runtimeVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_INVALID_RESPONSE' });
  });

  it('maps unauthorized responses to an expired session', async () => {
    vi.spyOn(instanceAxios, 'request').mockRejectedValue(axiosError(401));

    await expect(
      getNodeCatalog({
        accessToken: 'secret',
        runtimeVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_SESSION_EXPIRED', retryable: false });
  });
});
