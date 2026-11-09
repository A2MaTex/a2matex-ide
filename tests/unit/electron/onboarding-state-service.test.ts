import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { OnboardingStateService } from '@electron/main/services/onboarding-state-service';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createService() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'a2matex-onboarding-'));
  directories.push(directory);
  return {
    directory,
    service: new OnboardingStateService(directory),
  };
}

describe('OnboardingStateService', () => {
  it('writes a completed snapshot atomically and restores it', async () => {
    const { directory, service } = await createService();
    const snapshot = await service.complete(
      {
        acceptedTermsVersion: 't1',
        acceptedPrivacyVersion: 'p1',
        analyticsOptIn: false,
        workspaceCapability: null,
        adbStatus: 'no-device',
      },
      '/tmp/exports',
      { terms: 't1', privacy: 'p1' },
    );

    expect(snapshot).toMatchObject({ completed: true, workspaceLabel: '/tmp/exports' });
    expect(await service.getState()).toEqual(snapshot);
    expect(
      JSON.parse(await readFile(path.join(directory, 'config', 'onboarding.json'), 'utf8')),
    ).toMatchObject({ schemaVersion: 1, completed: true });
  });

  it('requires the current policy versions', async () => {
    const { service } = await createService();
    await expect(
      service.complete(
        {
          acceptedTermsVersion: 'old',
          acceptedPrivacyVersion: 'p1',
          analyticsOptIn: false,
          workspaceCapability: null,
          adbStatus: 'not-checked',
        },
        null,
        { terms: 't1', privacy: 'p1' },
      ),
    ).rejects.toMatchObject({ code: 'ONBOARDING_INPUT_INVALID' });
  });
});
