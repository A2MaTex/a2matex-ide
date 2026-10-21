import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FileNodeCatalogCache } from '../../electron/main/adapters/catalog/file-node-catalog-cache';
import type { NodeCatalogSnapshot } from '../../src/domain/node-catalog/node-catalog';

const roots: string[] = [];

async function createCache() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'a2matex-catalog-'));
  roots.push(root);
  return { root, cache: new FileNodeCatalogCache(root) };
}

function snapshot(account = 'developer'): NodeCatalogSnapshot {
  return {
    schemaVersion: 1,
    scope: {
      server: 'https://api.example.com',
      account,
      runtimeVersion: '0.1.0',
    },
    catalogHash: 'a'.repeat(64),
    fetchedAt: '2026-10-21T00:00:00.000Z',
    status: 'fresh',
    nodes: [
      {
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
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FileNodeCatalogCache', () => {
  it('round-trips a validated snapshot under the scoped cache key', async () => {
    const { cache } = await createCache();
    const value = snapshot();

    await cache.write(value);

    await expect(cache.read(value.scope)).resolves.toEqual(value);
    await expect(cache.read({ ...value.scope, account: 'another-user' })).resolves.toBeNull();
  });

  it('ignores a corrupt cache entry without replacing it with partial data', async () => {
    const { root, cache } = await createCache();
    const value = snapshot();
    await cache.write(value);
    const directory = path.join(root, 'catalog-cache-v3');
    const [file] = await readdir(directory);
    await writeFile(path.join(directory, file!), '{broken json', 'utf8');

    await expect(cache.read(value.scope)).resolves.toBeNull();
  });
});
