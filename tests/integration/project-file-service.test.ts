import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocationRegistry } from '../../electron/main/security/location-registry';
import {
  mapProjectFileError,
  ProjectFileService,
} from '../../electron/main/services/project-file-service';

describe('ProjectFileService', () => {
  let temporaryRoot: string;
  let locations: LocationRegistry;
  let service: ProjectFileService;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), 'a2matex-project-test-'));
    locations = new LocationRegistry();
    service = new ProjectFileService(locations);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('creates, atomically saves, and reopens a folder project', async () => {
    const parent = await locations.register(temporaryRoot, 'parent');
    const created = await service.create({ name: 'My Automation', parent });

    created.document.manifest.description = 'Saved through the filesystem adapter';
    await service.save(created);
    const reopened = await service.open(created.location);

    expect(reopened.document.manifest.description).toBe('Saved through the filesystem adapter');
    const manifest = JSON.parse(
      await readFile(path.join(temporaryRoot, 'my-automation', 'a2matex.project.json'), 'utf8'),
    ) as { schemaVersion: number };
    expect(manifest.schemaVersion).toBe(1);
    expect(await readdir(path.join(temporaryRoot, 'my-automation', 'workflows'))).toEqual([
      'main.workflow.json',
    ]);
  });

  it('rejects malformed project names before creating a directory', async () => {
    const parent = await locations.register(temporaryRoot, 'parent');

    await expect(service.create({ name: '   ', parent })).rejects.toMatchObject({
      code: 'PROJECT_NAME_INVALID',
    });
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it('rejects renderer paths that were not granted by the main process', async () => {
    const error = await service
      .open({ id: 'forged-token', displayPath: '/tmp/forged' })
      .catch(mapProjectFileError);

    expect(error).toMatchObject({
      code: 'PROJECT_LOCATION_INVALID',
      retryable: false,
    });
  });
});
