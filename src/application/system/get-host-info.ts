import type { HostGateway } from '@application/system/host-gateway';

export async function getHostInfo(gateway: HostGateway) {
  return gateway.getInfo();
}
