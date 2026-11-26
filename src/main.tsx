import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppErrorBoundary } from '@app/bootstrap/AppErrorBoundary';
import { AppProviders } from '@app/providers/AppProviders';
import { AppRouter } from '@app/router/AppRouter';
import { initTheme } from '@presentation/features/theme/theme-store';

import '@xyflow/react/dist/style.css';
import '@/index.css';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </AppErrorBoundary>
  </StrictMode>,
);
