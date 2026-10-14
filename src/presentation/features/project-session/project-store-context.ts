import { createContext } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectStoreState } from '@presentation/stores/project-store';

export const ProjectStoreContext = createContext<StoreApi<ProjectStoreState> | null>(null);
