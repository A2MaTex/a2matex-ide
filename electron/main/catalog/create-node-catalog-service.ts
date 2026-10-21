import {
  NodeCatalogError,
  NodeCatalogService,
  type NodeCatalogClient,
} from '../../../src/application/node-catalog/node-catalog.js';
import type { MainAuthClient } from '../auth/create-auth-session-service.js';
import { FileNodeCatalogCache } from '../adapters/catalog/file-node-catalog-cache.js';
import { createNodeCatalogApi } from '../api/node-catalog-api.js';
import { configureApiRequest } from '../api/request.js';
import { loadApiConfig } from '../config/api-config.js';

class UnavailableNodeCatalogClient implements NodeCatalogClient {
  load(): Promise<never> {
    return Promise.reject(
      new NodeCatalogError(
        'CATALOG_CONFIGURATION_ERROR',
        'The node catalog API is not configured.',
        false,
      ),
    );
  }

  refresh(): Promise<never> {
    return this.load();
  }
}

export function createNodeCatalogService(input: {
  appPath: string;
  userDataPath: string;
  isPackaged: boolean;
  auth: MainAuthClient;
}): NodeCatalogClient {
  try {
    const config = loadApiConfig({
      appPath: input.appPath,
      isPackaged: input.isPackaged,
    });
    configureApiRequest(config.baseUrl, config.timeoutMs);
    return new NodeCatalogService(
      createNodeCatalogApi(),
      new FileNodeCatalogCache(input.userDataPath),
      input.auth,
      config.baseUrl,
    );
  } catch {
    return new UnavailableNodeCatalogClient();
  }
}
