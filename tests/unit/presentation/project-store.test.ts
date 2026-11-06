import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SaveProjectInput } from '@application/project/project-repository';
import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';
import { createProjectStore, projectStoreIsDirty } from '@presentation/stores/project-store';

afterEach(() => vi.useRealTimers());

describe('project store local-first lifecycle', () => {
  it('loads recent projects and reopens them by local ID', async () => {
    const repository = new InMemoryProjectRepository();
    const created = await repository.create('Recent Project');
    const store = createProjectStore(repository);

    await store.getState().loadRecent();
    expect(store.getState().recentProjects).toMatchObject([{ localId: created.localId }]);

    await store.getState().open(created.localId);
    expect(store.getState().session?.snapshot.localId).toBe(created.localId);
    expect(projectStoreIsDirty(store.getState())).toBe(false);
  });

  it('flushes locally before export without changing the project identity', async () => {
    const store = createProjectStore(new InMemoryProjectRepository());
    const created = await store.getState().create('Editable Project');
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
    const created = await store.getState().create('Autosave Project');

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
    const created = await store.getState().create('Race Project');
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
    const first = await store.getState().create('First Project');
    store.getState().updateProjectName('First Project Updated');

    const second = await store.getState().create('Second Project');
    expect(second?.document.manifest.name).toBe('Second Project');
    expect((await repository.open(first!.localId)).document.manifest.name).toBe(
      'First Project Updated',
    );
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
    const created = await store.getState().create('Retry Project');
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
