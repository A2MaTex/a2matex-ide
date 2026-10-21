import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadApiConfig } from '../../electron/main/config/api-config';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createAppDirectory(envSource?: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'a2matex-api-config-'));
  temporaryDirectories.push(directory);
  if (envSource) await writeFile(path.join(directory, '.env'), envSource, 'utf8');
  return directory;
}

describe('loadApiConfig', () => {
  it('loads VITE_API_BASE_URL from the app .env file', async () => {
    const appPath = await createAppDirectory(
      'VITE_API_BASE_URL=https://api.example.com\nIGNORED=value\n',
    );

    expect(loadApiConfig({ appPath, isPackaged: false, environment: {} })).toEqual({
      baseUrl: 'https://api.example.com',
      timeoutMs: 10_000,
    });
  });

  it('lets the process environment override the .env file', async () => {
    const appPath = await createAppDirectory('VITE_API_BASE_URL=https://file.example.com\n');

    expect(
      loadApiConfig({
        appPath,
        isPackaged: false,
        environment: { VITE_API_BASE_URL: 'https://environment.example.com' },
      }).baseUrl,
    ).toBe('https://environment.example.com');
  });

  it('rejects non-HTTPS production endpoints', async () => {
    const appPath = await createAppDirectory();

    expect(() =>
      loadApiConfig({
        appPath,
        isPackaged: true,
        environment: { VITE_API_BASE_URL: 'http://api.example.com' },
      }),
    ).toThrow('Production API connections require HTTPS.');
  });
});
