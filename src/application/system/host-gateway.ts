export interface HostInfo {
  appVersion: string;
  environment: 'development' | 'production';
  platform: string;
  runtime: 'desktop' | 'web';
}

export interface HostGateway {
  getInfo(): Promise<HostInfo>;
}
