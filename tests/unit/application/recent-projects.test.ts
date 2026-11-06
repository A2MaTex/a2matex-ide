import { describe, expect, it } from 'vitest';

import type { CloudProject } from '@application/project/project-cloud';
import { mergeRecentProjects } from '@application/project/recent-projects';
import { InMemoryProjectRepository } from '@infrastructure/persistence/in-memory-project-repository';

function cloud(id: string, name: string): CloudProject {
  return {
    id,
    publisherAccountId: '650e8400-e29b-41d4-a716-446655440000',
    name,
    description: null,
    status: 'ACTIVE',
    createdAt: '2026-11-06T08:00:00.000Z',
    updatedAt: null,
  };
}

describe('mergeRecentProjects', () => {
  it('merges only by remote identity and presents duplicate names as a conflict', async () => {
    const repository = new InMemoryProjectRepository();
    const local = await repository.create({ name: 'Same Name' });
    const remote = cloud('550e8400-e29b-41d4-a716-446655440000', ' same name ');

    const items = mergeRecentProjects([local], [remote]);

    expect(items).toHaveLength(2);
    expect(items.find((item) => item.local)?.state).toBe('name-conflict');
    expect(items.find((item) => item.cloud && !item.local)?.state).toBe('cloud-only');
  });

  it('deduplicates a bound local/cloud project by remote ID', async () => {
    const repository = new InMemoryProjectRepository();
    const local = await repository.create({ name: 'Local title' });
    local.remoteProjectId = '550e8400-e29b-41d4-a716-446655440000';

    const items = mergeRecentProjects([local], [cloud(local.remoteProjectId, 'Cloud title')]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Local title', state: 'bound' });
  });
});
