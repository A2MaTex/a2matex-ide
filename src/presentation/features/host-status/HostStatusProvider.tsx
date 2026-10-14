import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { getHostInfo } from '@application/system/get-host-info';
import type { HostGateway, HostInfo } from '@application/system/host-gateway';

import { HostStatusContext, type HostStatusValue } from './host-status-context';

interface HostStatusProviderProps {
  children: ReactNode;
  gateway: HostGateway;
}

export function HostStatusProvider({ children, gateway }: HostStatusProviderProps) {
  const [info, setInfo] = useState<HostInfo | null>(null);
  const [status, setStatus] = useState<HostStatusValue['status']>('loading');

  useEffect(() => {
    let active = true;

    getHostInfo(gateway)
      .then((hostInfo) => {
        if (!active) return;
        setInfo(hostInfo);
        setStatus(hostInfo.runtime === 'desktop' ? 'connected' : 'web');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [gateway]);

  const value = useMemo(() => ({ info, status }), [info, status]);

  return <HostStatusContext.Provider value={value}>{children}</HostStatusContext.Provider>;
}
