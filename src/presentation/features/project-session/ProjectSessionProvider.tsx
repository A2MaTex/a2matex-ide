import { useState, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectRepository } from '@application/project/project-repository';
import { createProjectStore, type ProjectStoreState } from '@presentation/stores/project-store';

import { ProjectStoreContext } from '@presentation/features/project-session/project-store-context';

interface ProjectSessionProviderProps {
  children: ReactNode;
  repository: ProjectRepository;
}

export function ProjectSessionProvider({ children, repository }: ProjectSessionProviderProps) {
  const [store] = useState<StoreApi<ProjectStoreState>>(() => createProjectStore(repository));

  return <ProjectStoreContext.Provider value={store}>{children}</ProjectStoreContext.Provider>;
}
