import { describe, expect, it, vi } from 'vitest';

import {
  NodeCatalogError,
  NodeCatalogService,
  type NodeCatalogCache,
  type NodeCatalogRemoteGateway,
} from '../../src/application/node-catalog/node-catalog';
import type {
  CatalogNodeDefinition,
  NodeCatalogSnapshot,
} from '../../src/domain/node-catalog/node-catalog';

const node: CatalogNodeDefinition = {
  type: 'flow.start',
  displayName: 'Start',
  description: 'Start workflow execution.',
  category: 'FLOW',
  runtimeHandler: 'flow.start',
  minimumRuntimeVersion: '0.1.0',
  defaultTimeoutMs: 1000,
  configSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  outputPorts: [{ key: 'success', kind: 'CONTROL', label: 'Success' }],
  editorHints: { icon: 'play', fieldOrder: [] },
  supportedErrorPolicies: ['STOP'],
  capabilities: [],
};

const scope = {
  server: 'https://api.example.com',
  account: 'developer',
  runtimeVersion: '0.1.0',
} as const;

function cachedSnapshot(): NodeCatalogSnapshot {
  return {
    schemaVersion: 1,
    scope,
    catalogHash: 'a'.repeat(64),
    fetchedAt: '2026-10-20T00:00:00.000Z',
    status: 'fresh',
    nodes: [node],
  };
}

function setup(cached: NodeCatalogSnapshot | null = null) {
  const remote: NodeCatalogRemoteGateway = { fetch: vi.fn() };
  const cache: NodeCatalogCache = {
    read: vi.fn().mockResolvedValue(cached),
    write: vi.fn().mockResolvedValue(undefined),
  };
  const auth = {
    restore: vi.fn().mockResolvedValue({
      status: 'authenticated' as const,
      account: 'developer',
      persistence: 'secure' as const,
    }),
    getAccessToken: vi.fn().mockReturnValue('access-secret'),
  };
  const service = new NodeCatalogService(
    remote,
    cache,
    auth,
    scope.server,
    () => new Date('2026-10-21T00:00:00.000Z'),
  );
  return { service, remote, cache };
}

describe('NodeCatalogService', () => {
  it('writes a validated remote catalog before publishing it', async () => {
    const { service, remote, cache } = setup();
    vi.mocked(remote.fetch).mockResolvedValue({
      status: 'modified',
      catalogHash: 'b'.repeat(64),
      nodes: [node],
    });

    await expect(service.load('0.1.0')).resolves.toMatchObject({
      status: 'fresh',
      catalogHash: 'b'.repeat(64),
      nodes: [node],
    });
    expect(cache.write).toHaveBeenCalledOnce();
  });

  it('revalidates a matching cache with the opaque catalog hash', async () => {
    const cached = cachedSnapshot();
    const { service, remote, cache } = setup(cached);
    vi.mocked(remote.fetch).mockResolvedValue({ status: 'not-modified' });

    await expect(service.refresh('0.1.0')).resolves.toMatchObject({
      status: 'fresh',
      fetchedAt: '2026-10-21T00:00:00.000Z',
    });
    expect(remote.fetch).toHaveBeenCalledWith({
      accessToken: 'access-secret',
      runtimeVersion: '0.1.0',
      catalogHash: cached.catalogHash,
    });
    expect(cache.write).toHaveBeenCalledOnce();
  });

  it('keeps the last-known-good catalog when the network is unavailable', async () => {
    const { service, remote } = setup(cachedSnapshot());
    vi.mocked(remote.fetch).mockRejectedValue(
      new NodeCatalogError('CATALOG_NETWORK_UNAVAILABLE', 'offline', true),
    );

    await expect(service.load('0.1.0')).resolves.toMatchObject({
      status: 'cached-offline',
      catalogHash: 'a'.repeat(64),
    });
  });

  it('returns a cache-miss error when neither network nor cache is available', async () => {
    const { service, remote } = setup();
    vi.mocked(remote.fetch).mockRejectedValue(
      new NodeCatalogError('CATALOG_NETWORK_UNAVAILABLE', 'offline', true),
    );

    await expect(service.load('0.1.0')).rejects.toMatchObject({
      code: 'CATALOG_CACHE_MISS',
      retryable: true,
    });
  });

  it('deduplicates concurrent sync requests for the same scope', async () => {
    const { service, remote } = setup();
    let resolveRequest!: () => void;
    vi.mocked(remote.fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({ status: 'modified', catalogHash: 'c'.repeat(64), nodes: [node] });
        }),
    );

    const first = service.load('0.1.0');
    const second = service.refresh('0.1.0');
    await vi.waitFor(() => expect(remote.fetch).toHaveBeenCalledOnce());
    resolveRequest();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(remote.fetch).toHaveBeenCalledOnce();
  });
});
