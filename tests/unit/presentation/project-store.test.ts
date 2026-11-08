import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SaveProjectInput } from '@application/project/project-repository';
import type { ProjectCloudClient } from '@application/project/project-cloud';
import { ANDROID_SELECTOR_V1_FORMAT } from '@domain/android-inspector/android-selector';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';
import { createProjectStore, projectStoreIsDirty } from '@presentation/stores/project-store';

afterEach(() => vi.useRealTimers());

describe('project store local-first lifecycle', () => {
  it('loads recent projects and reopens them by local ID', async () => {
    const repository = new InMemoryProjectRepository();
    const created = await repository.create({ name: 'Recent Project' });
    const store = createProjectStore(repository);

    await store.getState().loadRecent();
    expect(store.getState().recentProjects).toMatchObject([{ localId: created.localId }]);

    await store.getState().open(created.localId);
    expect(store.getState().session?.snapshot.localId).toBe(created.localId);
    expect(projectStoreIsDirty(store.getState())).toBe(false);
  });

  it('flushes locally before export without changing the project identity', async () => {
    const store = createProjectStore(new InMemoryProjectRepository());
    const created = await store.getState().create({ name: 'Editable Project' });
    expect(created).not.toBeNull();

    store.getState().updateProjectName('Edited Project');
    expect(projectStoreIsDirty(store.getState())).toBe(true);
    await store.getState().exportProject();
    expect(projectStoreIsDirty(store.getState())).toBe(false);
    expect(store.getState().session?.snapshot.localId).toBe(created?.localId);
    expect(store.getState().session?.snapshot.draftState.localRevision).toBe(1);
    expect(store.getState().session?.snapshot.draftState.metadataRevision).toBe(1);
  });

  it('autosaves a semantic edit after the debounce window', async () => {
    vi.useFakeTimers();
    const repository = new InMemoryProjectRepository();
    const store = createProjectStore(repository);
    const created = await store.getState().create({ name: 'Autosave Project' });

    store.getState().updateProjectName('Autosaved Project');
    expect(store.getState().localSaveStatus).toBe('dirty');
    await vi.advanceTimersByTimeAsync(2_999);
    expect((await repository.open(created!.localId)).document.manifest.name).toBe(
      'Autosave Project',
    );

    await vi.advanceTimersByTimeAsync(1);
    expect((await repository.open(created!.localId)).document.manifest.name).toBe(
      'Autosaved Project',
    );
    expect(store.getState().localSaveStatus).toBe('saved-local');
    expect(projectStoreIsDirty(store.getState())).toBe(false);
  });

  it('applies and locally round-trips an Android selector in one semantic revision', async () => {
    vi.useFakeTimers();
    const repository = new InMemoryProjectRepository();
    const store = createProjectStore(repository);
    const created = await store.getState().create({ name: 'Selector Project' });
    const definition: NodeDefinition = {
      type: 'android.tap_selector',
      version: 1,
      displayName: 'Tap element',
      description: 'Tap an Android element by selector.',
      category: 'Android',
      icon: 'mouse-pointer-click',
      inputs: [],
      outputs: [],
      properties: {
        type: 'object',
        required: ['target'],
        properties: {
          target: {
            type: 'object',
            title: 'Target',
            format: ANDROID_SELECTOR_V1_FORMAT,
            storage: 'binding',
            ui: { control: 'android-selector' },
          },
        },
      },
      requiredCapabilities: [],
      requiredPermissions: [],
      runtimeHandler: 'android.tap_selector',
      supportedErrorPolicies: ['STOP'],
    };
    const workflowPath = created!.document.manifest.entryWorkflow;

    expect(
      store.getState().executeWorkflowCommand(
        workflowPath,
        {
          type: 'node.add',
          payload: {
            nodeId: 'tap-1',
            nodeType: definition.type,
            nodeVersion: definition.version,
            position: { x: 100, y: 100 },
          },
        },
        [definition],
      ),
    ).toBe(true);
    const revisionBeforeSelector = store.getState().session!.workingRevision;
    const selector = {
      schemaVersion: 1,
      strategy: 'resourceId',
      value: 'com.example:id/submit',
      packageName: 'com.example',
    } as const;

    expect(
      store.getState().executeWorkflowCommand(
        workflowPath,
        {
          type: 'node.updateParams',
          payload: { nodeId: 'tap-1', changes: { target: selector } },
        },
        [definition],
      ),
    ).toBe(true);
    expect(store.getState().session!.workingRevision).toBe(revisionBeforeSelector + 1);
    expect(
      store
        .getState()
        .session!.snapshot.document.workflows[workflowPath].nodes.find(
          (candidate) => candidate.id === 'tap-1',
        )?.bindings.target,
    ).toEqual({ kind: 'constant', value: selector });

    await expect(store.getState().flushLocalSave()).resolves.toBe(true);
    const reopened = await repository.open(created!.localId);
    expect(
      reopened.document.workflows[workflowPath].nodes.find((candidate) => candidate.id === 'tap-1')
        ?.bindings.target,
    ).toEqual({ kind: 'constant', value: selector });
  });

  it('keeps a newer edit dirty while an older snapshot is being written', async () => {
    vi.useFakeTimers();
    let releaseFirstSave!: () => void;
    let markFirstSaveStarted!: () => void;
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const firstSaveStarted = new Promise<void>((resolve) => {
      markFirstSaveStarted = resolve;
    });
    class BlockingRepository extends InMemoryProjectRepository {
      private firstSave = true;

      override async save(input: SaveProjectInput) {
        if (this.firstSave) {
          this.firstSave = false;
          markFirstSaveStarted();
          await firstSaveGate;
        }
        return super.save(input);
      }
    }

    const repository = new BlockingRepository();
    const store = createProjectStore(repository);
    const created = await store.getState().create({ name: 'Race Project' });
    store.getState().updateProjectName('Revision One');
    await vi.advanceTimersByTimeAsync(3_000);
    await firstSaveStarted;

    store.getState().updateProjectName('Revision Two');
    const flush = store.getState().flushLocalSave();
    releaseFirstSave();
    await expect(flush).resolves.toBe(true);

    expect(store.getState().localSaveStatus).toBe('saved-local');
    expect(store.getState().session?.snapshot.document.manifest.name).toBe('Revision Two');
    expect((await repository.open(created!.localId)).document.manifest.name).toBe('Revision Two');
    expect(store.getState().session?.snapshot.draftState.localRevision).toBe(2);
  });

  it('flushes pending work before switching projects', async () => {
    vi.useFakeTimers();
    const repository = new InMemoryProjectRepository();
    const store = createProjectStore(repository);
    const first = await store.getState().create({ name: 'First Project' });
    store.getState().updateProjectName('First Project Updated');

    const second = await store.getState().create({ name: 'Second Project' });
    expect(second?.document.manifest.name).toBe('Second Project');
    expect((await repository.open(first!.localId)).document.manifest.name).toBe(
      'First Project Updated',
    );
  });

  it('flushes the editor to SQLite before starting first cloud sync', async () => {
    const repository = new InMemoryProjectRepository();
    let uploadedName = '';
    const cloud: ProjectCloudClient = {
      archive: async () => {
        throw new Error('Not used');
      },
      getDetail: async () => {
        throw new Error('Not used');
      },
      load: async () => ({ projects: [], refreshedAt: null, source: 'cache', warning: null }),
      open: async () => {
        throw new Error('Not used');
      },
      refresh: async () => ({ projects: [], refreshedAt: null, source: 'network', warning: null }),
      sync: async (localId) => {
        const snapshot = await repository.open(localId);
        uploadedName = snapshot.document.manifest.name;
        return {
          ...snapshot,
          remoteProjectId: 'remote-1',
          draftState: {
            ...snapshot.draftState,
            baseRemoteVersion: 1,
            observedRemoteVersion: 1,
            lastSyncedLocalRevision: snapshot.draftState.localRevision,
            syncStatus: 'synced',
          },
        };
      },
      updateFromCloud: async () => {
        throw new Error('Not used');
      },
      update: async () => {
        throw new Error('Not used');
      },
    };
    const store = createProjectStore(repository, { cloud });
    await store.getState().create({ name: 'Before edit' });
    store.getState().updateProjectName('Durable before sync');

    await expect(store.getState().syncCloud()).resolves.toBe(true);

    expect(uploadedName).toBe('Durable before sync');
    expect(store.getState().session?.snapshot).toMatchObject({
      remoteProjectId: 'remote-1',
      draftState: { localRevision: 1, syncStatus: 'synced' },
    });
  });

  it('keeps the editor dirty after a local failure and retries on flush', async () => {
    vi.useFakeTimers();
    class FailOnceRepository extends InMemoryProjectRepository {
      private shouldFail = true;

      override save(input: SaveProjectInput) {
        if (this.shouldFail) {
          this.shouldFail = false;
          return Promise.reject(new Error('Local disk unavailable'));
        }
        return super.save(input);
      }
    }

    const repository = new FailOnceRepository();
    const store = createProjectStore(repository);
    const created = await store.getState().create({ name: 'Retry Project' });
    store.getState().updateProjectName('Retry Project Updated');
    await vi.advanceTimersByTimeAsync(3_000);

    expect(store.getState().localSaveStatus).toBe('local-save-error');
    expect(projectStoreIsDirty(store.getState())).toBe(true);
    await expect(store.getState().flushLocalSave()).resolves.toBe(true);
    expect(store.getState().localSaveStatus).toBe('saved-local');
    expect(store.getState().error).toBeNull();
    expect((await repository.open(created!.localId)).document.manifest.name).toBe(
      'Retry Project Updated',
    );
  });
});
