import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import URL from '@app/constants/url';

type GuardState = 'loading' | 'complete' | 'required';

export function RequireOnboarding() {
  const [state, setState] = useState<GuardState>(window.studioHost ? 'loading' : 'complete');

  useEffect(() => {
    let current = true;
    if (!window.studioHost) return;
    void window.studioHost.onboarding.getState().then((result) => {
      if (current) setState(result.ok && result.value.completed ? 'complete' : 'required');
    });
    return () => {
      current = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="grid h-screen place-items-center bg-background text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-label="Loading setup" />
      </div>
    );
  }
  if (state === 'required') return <Navigate replace to={URL.Onboarding} />;
  return <Outlet />;
}
