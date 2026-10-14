import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@presentation/components/layout/AppShell';
import { ProjectHomePage } from '@presentation/pages/ProjectHomePage';
import { SettingsPage } from '@presentation/pages/SettingsPage';
import { MainWorkflowPage } from '@/presentation/pages/MainWorkflowPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to="/projects" />} />
        <Route path="projects" element={<ProjectHomePage />} />
        <Route path="workspace/:projectId" element={<MainWorkflowPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/projects" />} />
      </Route>
    </Routes>
  );
}
