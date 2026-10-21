import type { SessionState } from '../auth/auth-session.js';
import {
  nodeCatalogScopeSchema,
  type CatalogNodeDefinition,
  type NodeCatalogScope,
  type NodeCatalogSnapshot,
} from '../../domain/node-catalog/node-catalog.js';

export type NodeCatalogErrorCode =
  | 'CATALOG_INVALID_INPUT'
  | 'CATALOG_UNAUTHENTICATED'
  | 'CATALOG_SESSION_EXPIRED'
  | 'CATALOG_NETWORK_UNAVAILABLE'
  | 'CATALOG_TIMEOUT'
  | 'CATALOG_SERVER_ERROR'
  | 'CATALOG_INVALID_RESPONSE'
  | 'CATALOG_CACHE_MISS'
  | 'CATALOG_CACHE_WRITE_FAILED'
  | 'CATALOG_CONFIGURATION_ERROR'
  | 'CATALOG_UNKNOWN_ERROR';

export class NodeCatalogError extends Error {
  readonly code: NodeCatalogErrorCode;
  readonly retryable: boolean;

  constructor(code: NodeCatalogErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'NodeCatalogError';
    this.code = code;
    this.retryable = retryable;
  }
}

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

export interface MainAuthSession {
  restore(): Promise<SessionState>;
  getAccessToken(): string | null;
}

export interface NodeCatalogClient {
  load(runtimeVersion: string): Promise<NodeCatalogSnapshot>;
  refresh(runtimeVersion: string): Promise<NodeCatalogSnapshot>;
}

function asCatalogError(error: unknown): NodeCatalogError {
  if (error instanceof NodeCatalogError) return error;
  return new NodeCatalogError(
    'CATALOG_UNKNOWN_ERROR',
    'The node catalog could not be loaded.',
    true,
  );
}

function cacheStatus(error: NodeCatalogError): NodeCatalogSnapshot['status'] {
  return error.code === 'CATALOG_NETWORK_UNAVAILABLE' || error.code === 'CATALOG_TIMEOUT'
    ? 'cached-offline'
    : 'cached-refresh-failed';
}

export class NodeCatalogService implements NodeCatalogClient {
  private readonly inFlight = new Map<string, Promise<NodeCatalogSnapshot>>();
  private readonly remote: NodeCatalogRemoteGateway;
  private readonly cache: NodeCatalogCache;
  private readonly auth: MainAuthSession;
  private readonly server: string;
  private readonly now: () => Date;

  constructor(
    remote: NodeCatalogRemoteGateway,
    cache: NodeCatalogCache,
    auth: MainAuthSession,
    server: string,
    now: () => Date = () => new Date(),
  ) {
    this.remote = remote;
    this.cache = cache;
    this.auth = auth;
    this.server = server;
    this.now = now;
  }

  load(runtimeVersion: string): Promise<NodeCatalogSnapshot> {
    return this.sync(runtimeVersion);
  }

  refresh(runtimeVersion: string): Promise<NodeCatalogSnapshot> {
    return this.sync(runtimeVersion);
  }

  private async sync(runtimeVersion: string): Promise<NodeCatalogSnapshot> {
    const session = await this.auth.restore();
    const accessToken = this.auth.getAccessToken();
    if (session.status !== 'authenticated' || !accessToken) {
      throw new NodeCatalogError(
        'CATALOG_UNAUTHENTICATED',
        'Sign in before loading the node catalog.',
        false,
      );
    }

    const parsedScope = nodeCatalogScopeSchema.safeParse({
      server: this.server,
      account: session.account,
      runtimeVersion,
    });
    if (!parsedScope.success) {
      throw new NodeCatalogError('CATALOG_INVALID_INPUT', 'The Runtime version is invalid.', false);
    }

    const scope = parsedScope.data;
    const key = JSON.stringify(scope);
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const request = this.syncScope(scope, accessToken).finally(() => {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }

  private async syncScope(
    scope: NodeCatalogScope,
    accessToken: string,
  ): Promise<NodeCatalogSnapshot> {
    const cached = await this.cache.read(scope);

    try {
      let result = await this.remote.fetch({
        accessToken,
        runtimeVersion: scope.runtimeVersion,
        ...(cached ? { catalogHash: cached.catalogHash } : {}),
      });

      if (result.status === 'not-modified' && !cached) {
        result = await this.remote.fetch({
          accessToken,
          runtimeVersion: scope.runtimeVersion,
        });
      }

      const fetchedAt = this.now().toISOString();
      const snapshot: NodeCatalogSnapshot =
        result.status === 'not-modified'
          ? { ...cached!, fetchedAt, status: 'fresh' }
          : {
              schemaVersion: 1,
              scope,
              catalogHash: result.catalogHash,
              fetchedAt,
              status: 'fresh',
              nodes: result.nodes,
            };

      try {
        await this.cache.write(snapshot);
      } catch {
        throw new NodeCatalogError(
          'CATALOG_CACHE_WRITE_FAILED',
          'The refreshed node catalog could not be cached safely.',
          true,
        );
      }
      return snapshot;
    } catch (error) {
      const mapped = asCatalogError(error);
      if (
        cached &&
        mapped.code !== 'CATALOG_SESSION_EXPIRED' &&
        mapped.code !== 'CATALOG_UNAUTHENTICATED'
      ) {
        return { ...cached, status: cacheStatus(mapped) };
      }
      if (
        !cached &&
        (mapped.code === 'CATALOG_NETWORK_UNAVAILABLE' ||
          mapped.code === 'CATALOG_TIMEOUT' ||
          mapped.code === 'CATALOG_SERVER_ERROR')
      ) {
        throw new NodeCatalogError(
          'CATALOG_CACHE_MISS',
          'The node catalog is unavailable and no cached copy exists.',
          true,
        );
      }
      throw mapped;
    }
  }
}

export function toNodeCatalogError(error: unknown): NodeCatalogError {
  return asCatalogError(error);
}
