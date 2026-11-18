import { HashRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { electronHostGateway } from '@infrastructure/electron/electron-host-gateway';
import { hostAuthClient } from '@infrastructure/electron/host-auth-client';
import { hostProjectRepository } from '@infrastructure/electron/host-project-repository';
import { hostProjectCloudClient } from '@infrastructure/electron/host-project-cloud-client';
import { AuthProvider } from '@presentation/features/auth/AuthProvider';
import { HostStatusProvider } from '@presentation/features/host-status/HostStatusProvider';
import { ProjectSessionProvider } from '@presentation/features/project-session/ProjectSessionProvider';
import { ToastViewport } from '@presentation/components/ui/toast';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const cloud =
    import.meta.env.VITE_CLOUD_PROJECTS_ENABLED === 'false' ? undefined : hostProjectCloudClient;
  return (
    <HashRouter>
      <AuthProvider client={hostAuthClient}>
        <HostStatusProvider gateway={electronHostGateway}>
          <ProjectSessionProvider repository={hostProjectRepository} cloud={cloud}>
            {children}
            <ToastViewport />
          </ProjectSessionProvider>
        </HostStatusProvider>
      </AuthProvider>
    </HashRouter>
  );
}
