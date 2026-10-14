import { useContext } from 'react';
import { useStore } from 'zustand';

import type { ProjectStoreState } from '@presentation/stores/project-store';

import { ProjectStoreContext } from './project-store-context';

export function useProjectStore<T>(selector: (state: ProjectStoreState) => T): T {
  const store = useContext(ProjectStoreContext);
  if (!store) throw new Error('ProjectSessionProvider is missing');
  return useStore(store, selector);
}
