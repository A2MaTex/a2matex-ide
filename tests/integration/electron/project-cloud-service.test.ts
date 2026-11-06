import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainAuthSession } from '@application/auth/auth-session';
import {
  CloudProjectError,
  ProjectCloudService,
  type CloudProject,
  type CloudProjectGateway,
  type CloudProjectPage,
} from '@application/project/project-cloud';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { SqliteCloudProjectCache } from '@electron/main/adapters/project/sqlite-cloud-project-cache';
import { SqliteLocalProjectRepository } from '@electron/main/adapters/project/sqlite-local-project-repository';
import {
  openStudioDatabase,
  type StudioDatabase,
} from '@electron/main/persistence/studio-database';

const databases: StudioDatabase[] = [];
const REMOTE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PUBLISHER_ID = '650e8400-e29b-41d4-a716-446655440000';
const DRAFT_ID = '750e8400-e29b-41d4-a716-446655440000';

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

const auth: MainAuthSession = {
  restore: async () => ({ status: 'authenticated', account: 'publisher', persistence: 'secure' }),
  login: async () => ({ status: 'authenticated', account: 'publisher', persistence: 'secure' }),
  logout: async () => ({ status: 'signed-out' }),
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'refreshed-token',
  subscribe: () => () => undefined,
};

function cloudProject(name = 'Cloud Project'): CloudProject {
  return {
    id: REMOTE_ID,
    publisherAccountId: PUBLISHER_ID,
    name,
    description: null,
    status: 'ACTIVE',
    createdAt: '2026-11-06T08:00:00.000Z',
    updatedAt: null,
  };
}

function page(items: CloudProject[], current = 1, totalPages = 1): CloudProjectPage {
  return { items, page: current, limit: 100, totalItems: items.length, totalPages };
}

function gateway(overrides: Partial<CloudProjectGateway> = {}): CloudProjectGateway {
  return {
    archive: async () => undefined,
    create: async () => ({ id: REMOTE_ID }),
    get: async () => cloudProject(),
    getDraft: async () => ({ projectStatus: 'ACTIVE', draft: null }),
    list: async () => page([]),
    putDraft: async () => ({
      id: DRAFT_ID,
      version: 1,
      contentHash: 'a'.repeat(64),
      savedAt: '2026-11-06T09:00:00.000Z',
    }),
    update: async () => undefined,
    ...overrides,
  };
}

function setup(remote: CloudProjectGateway) {
  const database = openStudioDatabase({ filePath: ':memory:' });
  databases.push(database);
  const projects = new SqliteLocalProjectRepository(database.connection);
  const cache = new SqliteCloudProjectCache(database.connection);
  const service = new ProjectCloudService(remote, cache, projects, auth, async () => 'account-a', {
    now: () => '2026-11-06T10:00:00.000Z',
  });
  return { cache, projects, service };
}

async function createLocal(
  projects: SqliteLocalProjectRepository,
  name = 'Local Project',
  description?: string,
) {
  return projects.create({
    accountScope: 'account-a',
    document: createEmptyProjectDocument('manifest-1', name, description),
    localId: 'local-1',
  });
}

describe('ProjectCloudService', () => {
  it('sends the locally persisted description when creating the cloud project', async () => {
    const create = vi.fn(async () => ({ id: REMOTE_ID }));
    const { projects, service } = setup(gateway({ create }));
    await createLocal(projects, 'Described Project', 'Automates Android onboarding');

    await service.syncFirst('local-1');

    expect(create).toHaveBeenCalledWith('access-token', {
      name: 'Described Project',
      description: 'Automates Android onboarding',
    });
  });

  it('fetches every page and replaces the account cache only after completion', async () => {
    const list = vi.fn(async (_token: string, input: { page: number }) =>
      input.page === 1
        ? page([cloudProject('First')], 1, 2)
        : page([{ ...cloudProject('Second'), id: '550e8400-e29b-41d4-a716-446655440001' }], 2, 2),
    );
    const { cache, service } = setup(gateway({ list }));

    const result = await service.refresh();

    expect(list).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      source: 'network',
      projects: [{ name: 'First' }, { name: 'Second' }],
    });
    expect(await cache.list('account-a')).toHaveLength(2);
  });

  it('stops first sync on a duplicate cloud name without binding identities', async () => {
    const create = vi.fn(async () => ({ id: REMOTE_ID }));
    const { projects, service } = setup(
      gateway({ list: async () => page([cloudProject('  SAME NAME ')]), create }),
    );
    await createLocal(projects, 'Same Name');

    await expect(service.syncFirst('local-1')).rejects.toMatchObject({
      code: 'CLOUD_NAME_CONFLICT',
    });
    expect(create).not.toHaveBeenCalled();
    expect(await projects.findById('account-a', 'local-1')).toMatchObject({
      remoteProjectId: null,
      draftState: { syncStatus: 'name-conflict' },
    });
  });

  it('uses the persisted create checkpoint to recover a lost POST response', async () => {
    let attempt = 0;
    const create = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new CloudProjectError(
          'CLOUD_NETWORK_UNAVAILABLE',
          'Response was lost after create.',
          true,
        );
      }
      return { id: REMOTE_ID };
    });
    const list = vi.fn(async () => page(attempt === 0 ? [] : [cloudProject('Retry Project')]));
    const { projects, service } = setup(gateway({ create, list }));
    await createLocal(projects, 'Retry Project');

    await expect(service.syncFirst('local-1')).rejects.toMatchObject({
      code: 'CLOUD_NETWORK_UNAVAILABLE',
    });
    expect(await projects.findById('account-a', 'local-1')).toMatchObject({
      remoteProjectId: null,
      draftState: { remoteCreatePending: true, syncStatus: 'offline' },
    });

    await expect(service.syncFirst('local-1')).resolves.toMatchObject({
      remoteProjectId: REMOTE_ID,
      draftState: { baseRemoteVersion: 1, remoteCreatePending: false, syncStatus: 'synced' },
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('resumes from the persisted binding when metadata succeeds but draft upload fails', async () => {
    let draftAttempt = 0;
    const create = vi.fn(async () => ({ id: REMOTE_ID }));
    const putDraft = vi.fn(async () => {
      draftAttempt += 1;
      if (draftAttempt === 1) {
        throw new CloudProjectError('CLOUD_TIMEOUT', 'Draft acknowledgement was lost.', true);
      }
      return {
        id: DRAFT_ID,
        version: 1,
        contentHash: 'c'.repeat(64),
        savedAt: '2026-11-06T09:00:00.000Z',
      };
    });
    const { projects, service } = setup(gateway({ create, putDraft }));
    await createLocal(projects, 'Partial Sync');

    await expect(service.syncFirst('local-1')).rejects.toMatchObject({ code: 'CLOUD_TIMEOUT' });
    expect(await projects.findById('account-a', 'local-1')).toMatchObject({
      remoteProjectId: REMOTE_ID,
      draftState: {
        baseRemoteVersion: null,
        metadataSyncedRevision: 0,
        syncStatus: 'offline',
      },
    });

    await expect(service.syncFirst('local-1')).resolves.toMatchObject({
      remoteProjectId: REMOTE_ID,
      draftState: { baseRemoteVersion: 1, syncStatus: 'synced' },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('finishes as local-ahead when revision N+1 is saved during revision N upload', async () => {
    let releaseUpload!: () => void;
    let uploadStarted!: () => void;
    const gate = new Promise<void>((resolve) => (releaseUpload = resolve));
    const started = new Promise<void>((resolve) => (uploadStarted = resolve));
    const putDraft = vi.fn(async () => {
      uploadStarted();
      await gate;
      return {
        id: DRAFT_ID,
        version: 1,
        contentHash: 'b'.repeat(64),
        savedAt: '2026-11-06T09:00:00.000Z',
      };
    });
    const { projects, service } = setup(gateway({ putDraft }));
    const original = await createLocal(projects);

    const syncing = service.syncFirst('local-1');
    await started;
    const edited = structuredClone(original.document);
    edited.workflows['workflows/main.workflow.json'].name = 'Revision N+1';
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    releaseUpload();

    await expect(syncing).resolves.toMatchObject({
      draftState: { lastSyncedLocalRevision: 0, localRevision: 1, syncStatus: 'local-ahead' },
    });
  });
});
