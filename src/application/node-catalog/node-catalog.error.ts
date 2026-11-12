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

export function toNodeCatalogError(error: unknown): NodeCatalogError {
  if (error instanceof NodeCatalogError) return error;
  return new NodeCatalogError(
    'CATALOG_UNKNOWN_ERROR',
    'The node catalog could not be loaded.',
    true,
  );
}
