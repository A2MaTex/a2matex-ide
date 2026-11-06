import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalProjectPersistenceError } from '@application/project/local-project-repository';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { SqliteCloudProjectCache } from '@electron/main/adapters/project/sqlite-cloud-project-cache';
import { SqliteLocalProjectRepository } from '@electron/main/adapters/project/sqlite-local-project-repository';
import {
  getStudioDatabaseMetadata,
  openStudioDatabase,
  type StudioDatabase,
  withImmediateTransaction,
} from '@electron/main/persistence/studio-database';

const databases: StudioDatabase[] = [];
const temporaryDirectories: string[] = [];

function openMemoryDatabase() {
  const database = openStudioDatabase({ filePath: ':memory:' });
  databases.push(database);
  return database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe('studio database', () => {
  it('applies migration version 2 and rolls back failed transactions', () => {
    const database = openMemoryDatabase();
    expect(getStudioDatabaseMetadata(database.connection)).toEqual({
      databaseVersion: 2,
      nameNormalizationVersion: 1,
    });
    database.connection.exec('CREATE TABLE transaction_probe (value TEXT) STRICT');

    expect(() =>
      withImmediateTransaction(database.connection, () => {
        database.connection.prepare('INSERT INTO transaction_probe VALUES (?)').run('value');
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    const row = database.connection
      .prepare('SELECT COUNT(*) AS count FROM transaction_probe')
      .get() as {
      count: number;
    };
    expect(row.count).toBe(0);
  });

  it('reopens an existing database without rerunning destructive migrations', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'a2matex-studio-db-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'studio.sqlite3');
    const first = openStudioDatabase({ filePath });
    const firstRepository = new SqliteLocalProjectRepository(first.connection);
    await firstRepository.create({
      accountScope: 'account-a',
      document: createEmptyProjectDocument('manifest-1', 'Persistent Project'),
      localId: 'local-1',
    });
    first.close();

    const second = openStudioDatabase({ filePath });
    databases.push(second);
    const snapshot = await new SqliteLocalProjectRepository(second.connection).findById(
      'account-a',
      'local-1',
    );
    expect(snapshot?.document.manifest.name).toBe('Persistent Project');
    expect(getStudioDatabaseMetadata(second.connection).databaseVersion).toBe(2);
  });
});

describe('SqliteLocalProjectRepository', () => {
  it('creates the project, workflows and initial draft atomically', async () => {
    const database = openMemoryDatabase();
    const repository = new SqliteLocalProjectRepository(
      database.connection,
      undefined,
      () => '2026-11-05T10:00:00.000Z',
    );
    const snapshot = await repository.create({
      accountScope: 'account-a',
      document: createEmptyProjectDocument('manifest-1', 'First Project'),
      localId: 'local-1',
    });

    expect(snapshot).toMatchObject({
      accountScope: 'account-a',
      createdAt: '2026-11-05T10:00:00.000Z',
      localId: 'local-1',
      remoteProjectId: null,
      draftState: {
        baseRemoteVersion: null,
        localRevision: 0,
        metadataRevision: 0,
        runtimeIr: null,
        syncStatus: 'local-only',
      },
    });
    expect(Object.keys(snapshot.document.workflows)).toEqual(['workflows/main.workflow.json']);
  });

  it('enforces normalized names within an account but isolates different accounts', async () => {
    const database = openMemoryDatabase();
    const repository = new SqliteLocalProjectRepository(database.connection);
    await repository.create({
      accountScope: 'account-a',
      document: createEmptyProjectDocument('manifest-1', 'My Project'),
      localId: 'local-1',
    });

    await expect(
      repository.create({
        accountScope: 'account-a',
        document: createEmptyProjectDocument('manifest-2', '  MY   PROJECT  '),
        localId: 'local-2',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PROJECT_NAME' });
    await expect(
      repository.create({
        accountScope: 'account-b',
        document: createEmptyProjectDocument('manifest-3', 'my project'),
        localId: 'local-3',
      }),
    ).resolves.toMatchObject({ accountScope: 'account-b' });
  });

  it('increments durable revisions only when semantic content changes', async () => {
    const database = openMemoryDatabase();
    let tick = 0;
    const repository = new SqliteLocalProjectRepository(
      database.connection,
      undefined,
      () => `2026-11-05T10:00:0${tick++}.000Z`,
    );
    const document = createEmptyProjectDocument('manifest-1', 'Revision Project');
    await repository.create({ accountScope: 'account-a', document, localId: 'local-1' });

    const noOp = await repository.save({
      accountScope: 'account-a',
      document: structuredClone(document),
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    expect(noOp.draftState).toMatchObject({ localRevision: 0, metadataRevision: 0 });

    const renamed = structuredClone(document);
    renamed.manifest.name = 'Renamed Project';
    const saved = await repository.save({
      accountScope: 'account-a',
      document: renamed,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    expect(saved.draftState).toMatchObject({ localRevision: 1, metadataRevision: 1 });

    const workflowEdit = structuredClone(renamed);
    workflowEdit.workflows['workflows/main.workflow.json'].name = 'Renamed workflow';
    const workflowSaved = await repository.save({
      accountScope: 'account-a',
      document: workflowEdit,
      expectedLocalRevision: 1,
      localId: 'local-1',
    });
    expect(workflowSaved.draftState).toMatchObject({ localRevision: 2, metadataRevision: 1 });
  });

  it('rejects stale writers and invalid persisted data with typed errors', async () => {
    const database = openMemoryDatabase();
    const repository = new SqliteLocalProjectRepository(database.connection);
    const document = createEmptyProjectDocument('manifest-1', 'Safe Project');
    await repository.create({ accountScope: 'account-a', document, localId: 'local-1' });

    await expect(
      repository.save({
        accountScope: 'account-a',
        document,
        expectedLocalRevision: 3,
        localId: 'local-1',
      }),
    ).rejects.toMatchObject({ code: 'LOCAL_REVISION_CONFLICT' });

    database.connection
      .prepare('UPDATE projects SET manifest_json = ? WHERE local_id = ?')
      .run('{invalid', 'local-1');
    await expect(repository.findById('account-a', 'local-1')).rejects.toBeInstanceOf(
      LocalProjectPersistenceError,
    );
    await expect(repository.findById('account-a', 'local-1')).rejects.toMatchObject({
      code: 'CORRUPTED_LOCAL_DATA',
    });
  });

  it('invalidates compiled artifacts when workflow content changes', async () => {
    const database = openMemoryDatabase();
    const repository = new SqliteLocalProjectRepository(database.connection);
    const document = createEmptyProjectDocument('manifest-1', 'Compiled Project');
    await repository.create({ accountScope: 'account-a', document, localId: 'local-1' });

    const compiled = await repository.save({
      accountScope: 'account-a',
      artifacts: {
        inputSchema: { type: 'object' },
        runtimeIr: { instructions: ['compiled'] },
        testSummary: { passed: 1 },
        validationSummary: { errors: 0 },
      },
      document,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    expect(compiled.draftState.runtimeIr).toEqual({ instructions: ['compiled'] });

    const edited = structuredClone(document);
    edited.workflows['workflows/main.workflow.json'].name = 'Edited workflow';
    const saved = await repository.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 1,
      localId: 'local-1',
    });
    expect(saved.draftState).toMatchObject({
      inputSchema: { type: 'object' },
      runtimeIr: null,
      testSummary: {},
      validationSummary: {},
    });
  });
});

describe('SqliteCloudProjectCache', () => {
  it('replaces cache atomically and keeps accounts isolated', async () => {
    const database = openMemoryDatabase();
    const cache = new SqliteCloudProjectCache(database.connection);
    const project = {
      description: null,
      name: 'Cloud Project',
      normalizedName: 'cloud project',
      payload: { version: 1 },
      remoteProjectId: 'remote-1',
      remoteUpdatedAt: '2026-11-05T10:00:00.000Z',
      status: 'draft',
    } as const;

    await cache.replace('account-a', [project], {
      completed: true,
      nextCursor: null,
      refreshedAt: '2026-11-05T10:01:00.000Z',
    });
    await cache.replace('account-b', [{ ...project, remoteProjectId: 'remote-2' }], {
      completed: false,
      nextCursor: 'page-2',
      refreshedAt: '2026-11-05T10:02:00.000Z',
    });

    expect(await cache.list('account-a')).toHaveLength(1);
    expect(await cache.list('account-b')).toMatchObject([{ remoteProjectId: 'remote-2' }]);
    expect(await cache.state('account-b')).toMatchObject({
      completed: false,
      nextCursor: 'page-2',
    });

    await expect(
      cache.replace('account-a', [project, project], {
        completed: true,
        nextCursor: null,
        refreshedAt: '2026-11-05T10:03:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'TRANSACTION_FAILED' });
    expect(await cache.list('account-a')).toMatchObject([{ remoteProjectId: 'remote-1' }]);
  });
});
