import axios from 'axios';
import { z } from 'zod';

import {
  NodeCatalogError,
  type NodeCatalogRemoteGateway,
  type RemoteCatalogResult,
} from '../../../src/application/node-catalog/node-catalog.js';
import {
  catalogNodeDefinitionSchema,
  DEFAULT_NODE_CATALOG_RUNTIME_VERSION,
  type CatalogNodeDefinition,
} from '../../../src/domain/node-catalog/node-catalog.js';
import request from './request.js';

const MAX_CATALOG_BYTES = 2 * 1024 * 1024;

const objectSchema = z
  .object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.record(z.string(), z.json())),
    required: z.array(z.string()),
    additionalProperties: z.literal(false),
  })
  .strict();

const remoteNodeSchema = z
  .object({
    type: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.enum(['FLOW', 'UTILITY', 'ANDROID']),
    runtimeHandler: z.string(),
    minimumRuntimeVersion: z.string(),
    defaultTimeoutMs: z.number(),
    configSchema: objectSchema,
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    outputPorts: z
      .object({
        ports: z.array(
          z
            .object({
              key: z.enum(['success', 'error', 'true', 'false', 'body', 'completed']),
              kind: z.enum(['CONTROL', 'ERROR']),
              label: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
    editorHints: z
      .object({
        icon: z.string(),
        fieldOrder: z.array(z.string()),
      })
      .strict(),
    supportedErrorPolicies: z
      .object({ supported: z.array(z.enum(['STOP', 'ERROR_BRANCH'])) })
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
  .union([
    z
      .object({
        catalogHash: z.string().regex(/^[0-9a-f]{64}$/),
        nodes: z.array(remoteNodeSchema).max(500),
      })
      .strict(),
    z
      .object({
        data: z
          .object({
            catalogHash: z.string().regex(/^[0-9a-f]{64}$/),
            nodes: z.array(remoteNodeSchema).max(500),
          })
          .strict(),
        statusCode: z.number().int(),
      })
      .strict(),
  ])
  .transform((response) => ('data' in response ? response.data : response));

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
    editorHints: node.editorHints,
    supportedErrorPolicies: node.supportedErrorPolicies.supported,
    capabilities: node.capabilities,
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

    const parsed = responseSchema.safeParse(response.data);
    const nodes = parsed.success
      ? z
          .array(catalogNodeDefinitionSchema)
          .max(500)
          .safeParse(parsed.data.nodes.map(normalizeNode))
      : null;
    if (!parsed.success || !nodes?.success) {
      throw new NodeCatalogError(
        'CATALOG_INVALID_RESPONSE',
        'The node catalog response is invalid.',
        true,
      );
    }

    return { status: 'modified', catalogHash: parsed.data.catalogHash, nodes: nodes.data };
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
