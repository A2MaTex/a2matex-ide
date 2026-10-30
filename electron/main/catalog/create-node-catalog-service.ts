import {
  NodeCatalogError,
  NodeCatalogService,
  type NodeCatalogClient,
} from '@application/node-catalog/node-catalog';
import { FileNodeCatalogCache } from '@electron/main/adapters/catalog/file-node-catalog-cache';
import { createNodeCatalogApi } from '@electron/main/api/node-catalog.api';
import { configureApiRequest } from '@electron/main/api/request';
import type { MainAuthClient } from '@electron/main/auth/create-auth-session-service';
import { loadApiConfig } from '@electron/main/config/api-config';

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
