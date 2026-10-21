import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './use-auth';

export function RequireSession() {
  const { session, status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') {
    return (
      <div className="grid h-screen place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 text-sm">
          <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
          Restoring session…
        </div>
      </div>
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to="/login" />
    );
  }

  return <Outlet />;
}
