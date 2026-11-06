import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { SqliteLocalProjectRepository } from '@electron/main/adapters/project/sqlite-local-project-repository';
import { LocationRegistry } from '@electron/main/security/location-registry';
import { LocalProjectService } from '@electron/main/services/local-project-service';
import { ProjectArchiveService } from '@electron/main/services/project-file-service';
import {
  openStudioDatabase,
  type StudioDatabase,
} from '@electron/main/persistence/studio-database';

const databases: StudioDatabase[] = [];
const temporaryDirectories: string[] = [];

function createHarness(ids: string[]) {
  const database = openStudioDatabase({ filePath: ':memory:' });
  databases.push(database);
  const locations = new LocationRegistry();
  const archives = new ProjectArchiveService(locations);
  const repository = new SqliteLocalProjectRepository(database.connection);
  const service = new LocalProjectService(
    repository,
    archives,
    () => Promise.resolve('login:test@example.com'),
    () => ids.shift()!,
  );
  return { archives, locations, repository, service };
}

function createProjectFolder(directory: string, name: string) {
  const document = createEmptyProjectDocument('portable-project-id', name);
  mkdirSync(path.join(directory, 'workflows'));
  writeFileSync(
    path.join(directory, 'a2matex.project.json'),
    JSON.stringify(document.manifest),
    'utf8',
  );
  writeFileSync(
    path.join(directory, 'workflows', 'main.workflow.json'),
    JSON.stringify(document.workflows['workflows/main.workflow.json']),
    'utf8',
  );
  return document;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe('LocalProjectService', () => {
  it('creates, lists and opens a SQLite project by local identity', async () => {
    const { service } = createHarness(['local-1', 'local-2']);
    const created = await service.create({
      name: 'Offline Project',
      description: 'Runs without a network connection',
    });

    expect(created).toMatchObject({
      localId: 'local-1',
      remoteProjectId: null,
      draftState: { localRevision: 0, metadataRevision: 0, syncStatus: 'local-only' },
    });
    expect(created.document.manifest.projectId).toBe('local-1');
    expect(created.document.manifest.description).toBe('Runs without a network connection');
    await expect(service.list()).resolves.toMatchObject([{ localId: 'local-1' }]);
    await expect(service.open('local-1')).resolves.toMatchObject({ localId: 'local-1' });

    await expect(service.create({ name: '  OFFLINE   PROJECT ' })).rejects.toMatchObject({
      code: 'DUPLICATE_PROJECT_NAME',
    });
    await expect(service.list()).resolves.toHaveLength(1);
  });

  it('materializes an imported folder and exports without changing local identity', async () => {
    const { locations, service } = createHarness(['local-import']);
    const root = mkdtempSync(path.join(tmpdir(), 'a2matex-phase-2-'));
    temporaryDirectories.push(root);
    const sourceDirectory = path.join(root, 'source');
    const exportDirectory = path.join(root, 'export');
    mkdirSync(sourceDirectory);
    mkdirSync(exportDirectory);
    const portableDocument = createProjectFolder(sourceDirectory, 'Imported Project');

    const source = await locations.register(sourceDirectory, 'project');
    const imported = await service.importProject(source);
    expect(imported.localId).toBe('local-import');
    expect(imported.document.manifest.projectId).toBe('portable-project-id');

    const target = await locations.register(exportDirectory, 'target');
    const result = await service.exportProject({ document: imported.document }, target);
    expect(result.displayPath).toBe(exportDirectory);
    expect(
      JSON.parse(readFileSync(path.join(exportDirectory, 'a2matex.project.json'), 'utf8')),
    ).toEqual(portableDocument.manifest);
    expect((await service.open('local-import')).localId).toBe('local-import');
  });
});
