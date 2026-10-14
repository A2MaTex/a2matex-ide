import { describe, expect, it } from 'vitest';

import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';

describe('ProjectRepository contract', () => {
  it('creates, saves, reopens, and saves a project as a new location', async () => {
    const repository = new InMemoryProjectRepository();
    const parent = await repository.chooseCreateParent();
    expect(parent).not.toBeNull();

    const created = await repository.create({ name: 'Contract project', parent: parent! });
    created.document.manifest.description = 'Persist this value';
    const saveResult = await repository.save(created);
    const reopened = await repository.open(saveResult.location);

    expect(reopened.document.manifest.description).toBe('Persist this value');

    const destination = await repository.chooseSaveAsLocation();
    expect(destination).not.toBeNull();
    const copyResult = await repository.saveAs(reopened, destination!);
    const copy = await repository.open(copyResult.location);

    expect(copy.location.id).not.toBe(reopened.location.id);
    expect(copy.document).toEqual(reopened.document);
  });

  it('returns null when the open picker is cancelled', async () => {
    const repository = new InMemoryProjectRepository();
    repository.setNextOpenLocation(null);

    expect(await repository.chooseOpenLocation()).toBeNull();
  });
});
