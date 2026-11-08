export type AndroidDeviceStatus = 'device' | 'offline' | 'unauthorized' | 'unknown';

export interface AndroidDevice {
  deviceId: string;
  status: AndroidDeviceStatus;
  usable: boolean;
  model?: string;
  product?: string;
  deviceName?: string;
  transportId?: string;
}

export interface InspectorBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface InspectorNode {
  nodeId: string;
  parentId?: string;
  traversalIndex: number;
  depth: number;
  packageName?: string;
  resourceId?: string;
  className: string;
  text?: string;
  contentDescription?: string;
  bounds: InspectorBounds;
  clickable: boolean;
  enabled: boolean;
}

export interface InspectorSnapshot {
  snapshotId: string;
  deviceId: string;
  capturedAt: string;
  screenshot: {
    mimeType: 'image/png';
    width: number;
    height: number;
    bytes: Uint8Array;
  };
  screen: {
    width?: number;
    height?: number;
    rotation?: number;
  };
  nodes: InspectorNode[];
  warnings: string[];
}
