import type { HostGateway, HostInfo } from '@application/system/host-gateway';

export class ElectronHostGateway implements HostGateway {
  async getInfo(): Promise<HostInfo> {
    if (window.studioHost) {
      return window.studioHost.system.getInfo();
    }

    return {
      appVersion: 'web-preview',
      environment: 'development',
      platform: 'browser',
      runtime: 'web',
    };
  }
}

export const electronHostGateway = new ElectronHostGateway();
