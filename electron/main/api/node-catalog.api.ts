import axios from 'axios';
import { z } from 'zod';

import {
  NodeCatalogError,
  type NodeCatalogRemoteGateway,
  type RemoteCatalogResult,
} from '@application/node-catalog/node-catalog';
import {
  catalogObjectSchema,
  catalogNodeDefinitionSchema,
  catalogTargetingSchema,
  DEFAULT_NODE_CATALOG_RUNTIME_VERSION,
  type CatalogNodeDefinition,
} from '@domain/node-catalog/node-catalog';
import request from '@electron/main/api/request';

const MAX_CATALOG_BYTES = 2 * 1024 * 1024;

const remoteNodeSchema = z
  .object({
    type: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.enum(['FLOW', 'UTILITY', 'ANDROID']),
    runtimeHandler: z.string(),
    minimumRuntimeVersion: z.string(),
    defaultTimeoutMs: z.number(),
    configSchema: catalogObjectSchema,
    inputSchema: catalogObjectSchema,
    outputSchema: catalogObjectSchema,
    outputPorts: z
      .object({
        ports: z.array(z.string().min(1).max(64)).max(100),
      })
      .strict(),
    editorHints: z
      .object({
        targeting: catalogTargetingSchema.optional(),
      })
      .strict(),
    capabilities: z.array(
      z
        .object({
          code: z.string(),
          name: z.string(),
          description: z.string(),
          isSensitive: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

const responseSchema = z
  .object({
    data: z
      .object({
        catalogHash: z.string().regex(/^[0-9a-f]{64}$/),
        nodes: z.array(remoteNodeSchema).max(500),
      })
      .strict(),
    statusCode: z.literal(200),
  })
  .strict()
  .transform((response) => response.data);

function normalizeNode(node: z.infer<typeof remoteNodeSchema>): CatalogNodeDefinition {
  return {
    type: node.type,
    displayName: node.name,
    description: node.description,
    category: node.category,
    runtimeHandler: node.runtimeHandler,
    minimumRuntimeVersion: node.minimumRuntimeVersion,
    defaultTimeoutMs: node.defaultTimeoutMs,
    configSchema: node.configSchema,
    inputSchema: node.inputSchema,
    outputSchema: node.outputSchema,
    outputPorts: node.outputPorts.ports,
    ...(node.editorHints.targeting ? { targeting: node.editorHints.targeting } : {}),
    capabilities: node.capabilities,
  };
}

export function parseNodeCatalogResponse(input: unknown): {
  catalogHash: string;
  nodes: CatalogNodeDefinition[];
} {
  const response = responseSchema.parse(input);
  return {
    catalogHash: response.catalogHash,
    nodes: z.array(catalogNodeDefinitionSchema).max(500).parse(response.nodes.map(normalizeNode)),
  };
}

export interface GetNodeCatalogInput {
  accessToken: string;
  runtimeVersion: string;
  catalogHash?: string;
}

export async function getNodeCatalog(input: GetNodeCatalogInput): Promise<RemoteCatalogResult> {
  try {
    const response = await request({
      url: '/api/v1/node-catalog',
      method: 'GET',
      params: { runtimeVersion: input.runtimeVersion || DEFAULT_NODE_CATALOG_RUNTIME_VERSION },
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.catalogHash ? { 'If-None-Match': `"${input.catalogHash}"` } : {}),
      },
      validateStatus: (status) => status === 200 || status === 304,
      maxContentLength: MAX_CATALOG_BYTES,
    });

    if (response.status === 304) return { status: 'not-modified' };
    if (JSON.stringify(response.data).length > MAX_CATALOG_BYTES) {
      throw new NodeCatalogError(
        'CATALOG_INVALID_RESPONSE',
        'The node catalog response exceeds the supported size.',
        true,
      );
    }

    let parsed: ReturnType<typeof parseNodeCatalogResponse> | null = null;
    try {
      parsed = parseNodeCatalogResponse(response.data);
    } catch {
      // Convert parser details into the stable, payload-safe application error below.
    }
    if (!parsed) {
      throw new NodeCatalogError(
        'CATALOG_INVALID_RESPONSE',
        'The node catalog response is invalid.',
        true,
      );
    }

    return { status: 'modified', catalogHash: parsed.catalogHash, nodes: parsed.nodes };
  } catch (error) {
    if (error instanceof NodeCatalogError) throw error;

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        throw new NodeCatalogError(
          'CATALOG_SESSION_EXPIRED',
          'The authenticated session is no longer valid.',
          false,
        );
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new NodeCatalogError('CATALOG_TIMEOUT', 'The node catalog request timed out.', true);
      }
      if (status !== undefined) {
        throw new NodeCatalogError(
          'CATALOG_SERVER_ERROR',
          'The node catalog service rejected the request.',
          status >= 500 || status === 429,
        );
      }
    }

    throw new NodeCatalogError(
      'CATALOG_NETWORK_UNAVAILABLE',
      'Unable to reach the node catalog service.',
      true,
    );
  }
}

export function createNodeCatalogApi(): NodeCatalogRemoteGateway {
  return { fetch: (input) => getNodeCatalog(input) };
}
