import type {
  CatalogNodeDefinition,
  NodeCatalogScope,
  NodeCatalogSnapshot,
} from '@domain/node-catalog/node-catalog';

export type RemoteCatalogResult =
  | { status: 'modified'; catalogHash: string; nodes: CatalogNodeDefinition[] }
  | { status: 'not-modified' };

export interface NodeCatalogRemoteGateway {
  fetch(input: {
    accessToken: string;
    runtimeVersion: string;
    catalogHash?: string;
  }): Promise<RemoteCatalogResult>;
}

export interface NodeCatalogCache {
  read(scope: NodeCatalogScope): Promise<NodeCatalogSnapshot | null>;
  write(snapshot: NodeCatalogSnapshot): Promise<void>;
}

export interface NodeCatalogClient {
  load(runtimeVersion: string): Promise<NodeCatalogSnapshot>;
  refresh(runtimeVersion: string): Promise<NodeCatalogSnapshot>;
}
