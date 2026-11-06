import { useEffect } from 'react';

export function useProjectCloseGuard(isDirty: boolean, flush: () => Promise<boolean>) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      void flush();
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flush, isDirty]);
}
