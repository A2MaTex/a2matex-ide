import { useState, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectRepository } from '@application/project/project-repository';
import type { ProjectCloudClient } from '@application/project/project-cloud';
import { createProjectStore, type ProjectStoreState } from '@presentation/stores/project-store';

import { ProjectStoreContext } from '@presentation/features/project-session/project-store-context';

interface ProjectSessionProviderProps {
  children: ReactNode;
  repository: ProjectRepository;
  cloud: ProjectCloudClient;
}

export function ProjectSessionProvider({
  children,
  repository,
  cloud,
}: ProjectSessionProviderProps) {
  const [store] = useState<StoreApi<ProjectStoreState>>(() =>
    createProjectStore(repository, { cloud }),
  );

  return <ProjectStoreContext.Provider value={store}>{children}</ProjectStoreContext.Provider>;
}
