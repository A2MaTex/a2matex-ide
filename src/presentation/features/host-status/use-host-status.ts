import { useContext } from 'react';

import { HostStatusContext } from '@presentation/features/host-status/host-status-context';

export function useHostStatus() {
  return useContext(HostStatusContext);
}
