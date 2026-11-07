import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainAuthSession } from '@application/auth/auth-session';
import {
  CloudProjectError,
  ProjectCloudService,
  type CloudProjectDraft,
  type CloudProjectDraftPayload,
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

function statefulGateway(name: string) {
  const state: { draft: CloudProjectDraft | null; project: CloudProject } = {
    draft: null,
    project: cloudProject(name),
  };
  const putDraft = vi.fn(
    async (_token: string, _projectId: string, input: CloudProjectDraftPayload) => {
      const version = (state.draft?.version ?? 0) + 1;
      const contentHash = String(version).repeat(64);
      const savedAt = `2026-11-06T09:00:0${version}.000Z`;
      state.draft = {
        id: DRAFT_ID,
        projectId: REMOTE_ID,
        version,
        editorGraph: input.editorGraph,
        inputSchema: input.inputSchema,
        runtimeIr: input.runtimeIr,
        validationSummary: input.validationSummary,
        testSummary: input.testSummary,
        contentHash,
        savedAt,
      };
      return { id: DRAFT_ID, version, contentHash, savedAt };
    },
  );
  const update = vi.fn(
    async (
      _token: string,
      _projectId: string,
      input: { name?: string; description?: string | null },
    ) => {
      state.project = {
        ...state.project,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      };
    },
  );
  return {
    state,
    putDraft,
    update,
    remote: gateway({
      get: async () => state.project,
      getDraft: async () => ({ projectStatus: state.project.status, draft: state.draft }),
      putDraft,
      update,
    }),
  };
}

function setup(remote: CloudProjectGateway) {
  const database = openStudioDatabase({ filePath: ':memory:' });
  databases.push(database);
  const projects = new SqliteLocalProjectRepository(database.connection);
  const cache = new SqliteCloudProjectCache(database.connection);
  const service = new ProjectCloudService(remote, cache, projects, auth, async () => 'account-a', {
    createId: () => 'cloud-local-1',
    now: () => '2026-11-06T10:00:00.000Z',
  });
  return { cache, database, projects, service };
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
  it('syncs the persisted entry workflow as the editorGraph without a project wrapper', async () => {
    const remote = statefulGateway('Direct graph');
    const { projects, service } = setup(remote.remote);
    const local = await createLocal(projects, 'Direct graph');

    await service.sync('local-1');

    expect(remote.state.draft?.editorGraph).toEqual(
      local.document.workflows[local.document.manifest.entryWorkflow],
    );
    expect(Object.keys(remote.state.draft!.editorGraph).sort()).toEqual([
      'edges',
      'entryNodeId',
      'nodes',
      'schemaVersion',
    ]);
    expect(remote.state.draft?.editorGraph).not.toHaveProperty('workflows');
    expect(remote.state.draft?.editorGraph).not.toHaveProperty('manifest');
  });

  it('sends the locally persisted description when creating the cloud project', async () => {
    const create = vi.fn(async () => ({ id: REMOTE_ID }));
    const { projects, service } = setup(gateway({ create }));
    await createLocal(projects, 'Described Project', 'Automates Android onboarding');

    await service.sync('local-1');

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

    await expect(service.sync('local-1')).rejects.toMatchObject({
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

    await expect(service.sync('local-1')).rejects.toMatchObject({
      code: 'CLOUD_NETWORK_UNAVAILABLE',
    });
    expect(await projects.findById('account-a', 'local-1')).toMatchObject({
      remoteProjectId: null,
      draftState: { remoteCreatePending: true, syncStatus: 'offline' },
    });

    await expect(service.sync('local-1')).resolves.toMatchObject({
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

    await expect(service.sync('local-1')).rejects.toMatchObject({ code: 'CLOUD_TIMEOUT' });
    expect(await projects.findById('account-a', 'local-1')).toMatchObject({
      remoteProjectId: REMOTE_ID,
      draftState: {
        baseRemoteVersion: null,
        metadataSyncedRevision: 0,
        syncStatus: 'offline',
      },
    });

    await expect(service.sync('local-1')).resolves.toMatchObject({
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

    const syncing = service.sync('local-1');
    await started;
    const edited = structuredClone(original.document);
    edited.workflows['workflows/main.workflow.json'].nodes[0]!.editor.x = 201;
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

  it('pushes a local-ahead revision with the current remote version', async () => {
    const remote = statefulGateway('Repeat Project');
    const { projects, service } = setup(remote.remote);
    const initial = await createLocal(projects, 'Repeat Project');
    await service.sync('local-1');
    const edited = structuredClone(initial.document);
    edited.workflows['workflows/main.workflow.json'].nodes[0]!.editor.x = 202;
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });

    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: { baseRemoteVersion: 2, lastSyncedLocalRevision: 1, syncStatus: 'synced' },
    });
    expect(remote.putDraft.mock.calls[1]?.[2]).toMatchObject({ expectedVersion: 1 });
  });

  it('marks remote-ahead without mutating cloud when a clean remote draft changed', async () => {
    const remote = statefulGateway('Remote Ahead');
    const { projects, service } = setup(remote.remote);
    await createLocal(projects, 'Remote Ahead');
    await service.sync('local-1');
    remote.state.draft = {
      ...remote.state.draft!,
      version: 2,
      contentHash: 'e'.repeat(64),
      editorGraph: { changedElsewhere: true },
    };

    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: { baseRemoteVersion: 1, observedRemoteVersion: 2, syncStatus: 'remote-ahead' },
    });
    expect(remote.putDraft).toHaveBeenCalledTimes(1);
  });

  it('marks conflict without PUT when both local and remote drafts changed', async () => {
    const remote = statefulGateway('Conflict Project');
    const { projects, service } = setup(remote.remote);
    const initial = await createLocal(projects, 'Conflict Project');
    await service.sync('local-1');
    const edited = structuredClone(initial.document);
    edited.workflows['workflows/main.workflow.json'].nodes[0]!.editor.x = 203;
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    remote.state.draft = {
      ...remote.state.draft!,
      version: 2,
      contentHash: 'f'.repeat(64),
      editorGraph: { changedElsewhere: true },
    };

    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: { observedRemoteVersion: 2, syncStatus: 'conflict' },
    });
    expect(remote.putDraft).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a same-content retry after the PUT response was lost', async () => {
    const remote = statefulGateway('Retry Draft');
    const originalPut = remote.remote.putDraft;
    let loseResponse = false;
    remote.remote.putDraft = async (...args) => {
      const result = await originalPut(...args);
      if (loseResponse) {
        loseResponse = false;
        throw new CloudProjectError('CLOUD_TIMEOUT', 'Response was lost.', true);
      }
      return result;
    };
    const { projects, service } = setup(remote.remote);
    const initial = await createLocal(projects, 'Retry Draft');
    await service.sync('local-1');
    const edited = structuredClone(initial.document);
    edited.workflows['workflows/main.workflow.json'].nodes[0]!.editor.x = 204;
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    loseResponse = true;
    await expect(service.sync('local-1')).rejects.toMatchObject({ code: 'CLOUD_TIMEOUT' });

    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: { baseRemoteVersion: 2, syncStatus: 'synced' },
    });
    expect(remote.putDraft).toHaveBeenCalledTimes(2);
  });

  it('rejects sync for an archived project without mutating metadata or draft', async () => {
    const remote = statefulGateway('Archived Project');
    const { projects, service } = setup(remote.remote);
    await createLocal(projects, 'Archived Project');
    await service.sync('local-1');
    remote.state.project = { ...remote.state.project, status: 'ARCHIVED' };

    await expect(service.sync('local-1')).rejects.toMatchObject({
      code: 'CLOUD_PROJECT_ARCHIVED',
    });
    expect(remote.putDraft).toHaveBeenCalledTimes(1);
  });

  it('marks remote-ahead when clean metadata changed on cloud', async () => {
    const remote = statefulGateway('Metadata Project');
    const { projects, service } = setup(remote.remote);
    await createLocal(projects, 'Metadata Project', 'Original');
    await service.sync('local-1');
    remote.state.project = { ...remote.state.project, description: 'Changed elsewhere' };

    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: { syncStatus: 'remote-ahead' },
    });
    expect(remote.update).toHaveBeenCalledTimes(1);
  });

  it('syncs local metadata through the independent metadata checkpoint', async () => {
    const remote = statefulGateway('Metadata Update');
    const { projects, service } = setup(remote.remote);
    const initial = await createLocal(projects, 'Metadata Update', 'Original');
    await service.sync('local-1');
    const edited = structuredClone(initial.document);
    edited.manifest.description = 'Edited locally';
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });

    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: {
        baseRemoteDescription: 'Edited locally',
        metadataSyncedRevision: 1,
        syncStatus: 'synced',
      },
    });
    expect(remote.state.project.description).toBe('Edited locally');
  });

  it('rejects an impossible draft acknowledgement version', async () => {
    const remote = statefulGateway('Invalid Ack');
    const { projects, service } = setup(remote.remote);
    const initial = await createLocal(projects, 'Invalid Ack');
    await service.sync('local-1');
    const edited = structuredClone(initial.document);
    edited.workflows['workflows/main.workflow.json'].nodes[0]!.editor.x = 205;
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });
    remote.remote.putDraft = async () => ({
      id: DRAFT_ID,
      version: 99,
      contentHash: '9'.repeat(64),
      savedAt: '2026-11-06T10:00:00.000Z',
    });

    await expect(service.sync('local-1')).rejects.toMatchObject({
      code: 'CLOUD_INVALID_RESPONSE',
    });
  });

  it('bootstraps a missing metadata baseline during an explicit legacy project edit', async () => {
    const remote = statefulGateway('Legacy Metadata');
    const { database, projects, service } = setup(remote.remote);
    const initial = await createLocal(projects, 'Legacy Metadata', 'Original');
    await service.sync('local-1');
    database.connection
      .prepare(
        `UPDATE project_draft_state
         SET base_remote_name = NULL, base_remote_description = NULL
         WHERE local_id = ?`,
      )
      .run('local-1');
    const edited = structuredClone(initial.document);
    edited.manifest.description = 'Explicit edit';
    await projects.save({
      accountScope: 'account-a',
      document: edited,
      expectedLocalRevision: 0,
      localId: 'local-1',
    });

    await service.update(REMOTE_ID, { description: 'Explicit edit' }, 'local-1');
    await expect(service.sync('local-1')).resolves.toMatchObject({
      draftState: {
        baseRemoteDescription: 'Explicit edit',
        baseRemoteName: 'Legacy Metadata',
        syncStatus: 'synced',
      },
    });
  });

  it('materializes a cloud-only project and its draft in one local snapshot', async () => {
    const remote = statefulGateway('Cloud only');
    const source = setup(remote.remote);
    await createLocal(source.projects, 'Cloud only', 'From cloud');
    await source.service.sync('local-1');
    remote.state.draft = {
      ...remote.state.draft!,
      editorGraph: structuredClone(remote.state.draft!.editorGraph),
    };
    const downloadedNodes = remote.state.draft.editorGraph.nodes as Array<{
      editor: { x: number; y: number };
    }>;
    downloadedNodes[0]!.editor.x = 301;
    const target = setup(remote.remote);

    await expect(target.service.open(REMOTE_ID)).resolves.toMatchObject({
      localId: 'cloud-local-1',
      remoteProjectId: REMOTE_ID,
      document: {
        manifest: { name: 'Cloud only', description: 'From cloud' },
        workflows: {
          'workflows/main.workflow.json': { nodes: [{ editor: { x: 301, y: 180 } }] },
        },
      },
      draftState: { baseRemoteVersion: 1, syncStatus: 'synced' },
    });
    await expect(target.projects.list('account-a')).resolves.toHaveLength(1);
  });

  it('opens a cloud project without a draft as a bound local-ahead project without PUT', async () => {
    const putDraft = vi.fn();
    const target = setup(gateway({ get: async () => cloudProject('Empty cloud'), putDraft }));

    await expect(target.service.open(REMOTE_ID)).resolves.toMatchObject({
      remoteProjectId: REMOTE_ID,
      document: { manifest: { name: 'Empty cloud' } },
      draftState: {
        baseRemoteVersion: null,
        lastSyncedLocalRevision: null,
        syncStatus: 'local-ahead',
      },
    });
    expect(putDraft).not.toHaveBeenCalled();
  });

  it('rejects an unsupported cloud draft before writing any local rows', async () => {
    const invalidDraft: CloudProjectDraft = {
      id: DRAFT_ID,
      projectId: REMOTE_ID,
      version: 2,
      editorGraph: { schemaVersion: 2 },
      inputSchema: {},
      runtimeIr: null,
      validationSummary: {},
      testSummary: {},
      contentHash: 'f'.repeat(64),
      savedAt: '2026-11-06T11:00:00.000Z',
    };
    const target = setup(
      gateway({
        getDraft: async () => ({ projectStatus: 'ACTIVE', draft: invalidDraft }),
      }),
    );

    await expect(target.service.open(REMOTE_ID)).rejects.toMatchObject({
      code: 'CLOUD_DRAFT_UNSUPPORTED',
    });
    await expect(target.projects.list('account-a')).resolves.toEqual([]);
  });

  it('reads legacy schema-1 drafts that do not contain the manifest extension', async () => {
    const document = createEmptyProjectDocument('remote-document', 'Legacy cloud');
    const legacyDraft: CloudProjectDraft = {
      id: DRAFT_ID,
      projectId: REMOTE_ID,
      version: 1,
      editorGraph: {
        schemaVersion: 1,
        entryWorkflow: document.manifest.entryWorkflow,
        workflows: document.workflows,
      },
      inputSchema: {},
      runtimeIr: null,
      validationSummary: {},
      testSummary: {},
      contentHash: '1'.repeat(64),
      savedAt: '2026-11-06T09:00:00.000Z',
    };
    const target = setup(
      gateway({
        get: async () => cloudProject('Legacy cloud'),
        getDraft: async () => ({ projectStatus: 'ACTIVE', draft: legacyDraft }),
      }),
    );

    await expect(target.service.open(REMOTE_ID)).resolves.toMatchObject({
      document: {
        manifest: {
          version: '0.1.0',
          minimumRuntimeVersion: '0.1.0',
          workflows: ['workflows/main.workflow.json'],
        },
      },
      draftState: { syncStatus: 'synced' },
    });
  });

  it('explicitly replaces a clean remote-ahead project from cloud', async () => {
    const remote = statefulGateway('Remote update');
    const target = setup(remote.remote);
    await createLocal(target.projects, 'Remote update');
    await target.service.sync('local-1');
    const editorGraph = structuredClone(remote.state.draft!.editorGraph);
    const remoteNodes = editorGraph.nodes as Array<{ editor: { x: number; y: number } }>;
    remoteNodes[0]!.editor.x = 302;
    remote.state.draft = {
      ...remote.state.draft!,
      version: 2,
      contentHash: '2'.repeat(64),
      editorGraph,
    };
    await target.service.sync('local-1');

    await expect(target.service.updateFromCloud('local-1')).resolves.toMatchObject({
      document: {
        workflows: {
          'workflows/main.workflow.json': { nodes: [{ editor: { x: 302, y: 180 } }] },
        },
      },
      draftState: {
        baseRemoteVersion: 2,
        localRevision: 1,
        lastSyncedLocalRevision: 1,
        syncStatus: 'synced',
      },
    });
  });

  it('does not overwrite a conflicting local draft with the cloud draft', async () => {
    const remote = statefulGateway('Protected local');
    const target = setup(remote.remote);
    const initial = await createLocal(target.projects, 'Protected local');
    await target.service.sync('local-1');
    const localDocument = structuredClone(initial.document);
    localDocument.workflows['workflows/main.workflow.json'].nodes[0]!.editor.x = 303;
    await target.projects.save({
      accountScope: 'account-a',
      localId: 'local-1',
      expectedLocalRevision: 0,
      document: localDocument,
    });
    remote.state.draft = {
      ...remote.state.draft!,
      version: 2,
      contentHash: '3'.repeat(64),
      editorGraph: { schemaVersion: 1, changedElsewhere: true },
    };
    await target.service.sync('local-1');

    await expect(target.service.updateFromCloud('local-1')).rejects.toMatchObject({
      code: 'CLOUD_LOCAL_CHANGES',
    });
    await expect(target.projects.findById('account-a', 'local-1')).resolves.toMatchObject({
      document: {
        workflows: {
          'workflows/main.workflow.json': { nodes: [{ editor: { x: 303, y: 180 } }] },
        },
      },
      draftState: { syncStatus: 'conflict' },
    });
  });
});
