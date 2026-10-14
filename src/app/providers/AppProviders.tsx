import { HashRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { electronHostGateway } from '@infrastructure/electron/electron-host-gateway';
import { hostProjectRepository } from '@infrastructure/electron/host-project-repository';
import { HostStatusProvider } from '@presentation/features/host-status/HostStatusProvider';
import { ProjectSessionProvider } from '@presentation/features/project-session/ProjectSessionProvider';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <HashRouter>
      <HostStatusProvider gateway={electronHostGateway}>
        <ProjectSessionProvider repository={hostProjectRepository}>
          {children}
        </ProjectSessionProvider>
      </HostStatusProvider>
    </HashRouter>
  );
}
