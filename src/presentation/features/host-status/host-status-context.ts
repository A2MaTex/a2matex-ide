import { createContext } from 'react';

import type { HostInfo } from '@application/system/host-gateway';

export interface HostStatusValue {
  info: HostInfo | null;
  status: 'connected' | 'error' | 'loading' | 'web';
}

export const HostStatusContext = createContext<HostStatusValue>({
  info: null,
  status: 'loading',
});
