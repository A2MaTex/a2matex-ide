import type { HostGateway } from './host-gateway';

export async function getHostInfo(gateway: HostGateway) {
  return gateway.getInfo();
}
