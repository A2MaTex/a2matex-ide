import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@presentation/components/layout/AppShell';
import { RequireSession } from '@presentation/features/auth/RequireSession';
import { LoginPage } from '@presentation/pages/LoginPage';
import { ProjectHomePage } from '@presentation/pages/ProjectHomePage';
import { SettingsPage } from '@presentation/pages/SettingsPage';
import { MainWorkflowPage } from '@/presentation/pages/MainWorkflowPage';
import URL from '@app/constants/url';

export function AppRouter() {
  return (
    <Routes>
      <Route path={URL.Login} element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to={URL.ProjectHome} />} />
          <Route path={URL.ProjectHome} element={<ProjectHomePage />} />
          <Route path={URL.MainWorkflowHome} element={<MainWorkflowPage />} />
          <Route path={URL.Settings} element={<SettingsPage />} />
          <Route path={URL.NotFound} element={<Navigate replace to={URL.ProjectHome} />} />
        </Route>
      </Route>
    </Routes>
  );
}
