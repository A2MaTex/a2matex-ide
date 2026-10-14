import { useContext } from 'react';

import { HostStatusContext } from './host-status-context';

export function useHostStatus() {
  return useContext(HostStatusContext);
}
