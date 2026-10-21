import { z } from 'zod';

export const DEFAULT_NODE_CATALOG_RUNTIME_VERSION = '0.1.0';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const identifierPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

const catalogFieldSchema = z.record(z.string(), z.json());

export const catalogObjectSchema = z
  .object({
    type: z.literal('object'),
    properties: z.record(z.string(), catalogFieldSchema),
    required: z.array(z.string().min(1).max(100)),
    additionalProperties: z.literal(false),
  })
  .strict();

export const catalogCapabilitySchema = z
  .object({
    code: z.string().min(1).max(255).regex(identifierPattern),
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(10_000),
    isSensitive: z.boolean(),
  })
  .strict();

export const catalogNodeDefinitionSchema = z
  .object({
    type: z.string().min(1).max(255).regex(identifierPattern),
    displayName: z.string().min(1).max(255),
    description: z.string().min(1).max(10_000),
    category: z.enum(['FLOW', 'UTILITY', 'ANDROID']),
    runtimeHandler: z.string().min(1).max(255).regex(identifierPattern),
    minimumRuntimeVersion: z.string().regex(semverPattern),
    defaultTimeoutMs: z.number().int().positive().max(600_000),
    configSchema: catalogObjectSchema,
    inputSchema: catalogObjectSchema,
    outputSchema: catalogObjectSchema,
    outputPorts: z.array(
      z
        .object({
          key: z.enum(['success', 'error', 'true', 'false', 'body', 'completed']),
          kind: z.enum(['CONTROL', 'ERROR']),
          label: z.string().min(1).max(255),
        })
        .strict(),
    ),
    editorHints: z
      .object({
        icon: z.string().min(1).max(100),
        fieldOrder: z.array(z.string().min(1).max(100)),
      })
      .strict(),
    supportedErrorPolicies: z.array(z.enum(['STOP', 'ERROR_BRANCH'])),
    capabilities: z.array(catalogCapabilitySchema),
  })
  .strict();

export const nodeCatalogScopeSchema = z
  .object({
    server: z.string().url(),
    account: z.string().min(1).max(320),
    runtimeVersion: z.string().regex(semverPattern),
  })
  .strict();

export const nodeCatalogSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    scope: nodeCatalogScopeSchema,
    catalogHash: z.string().regex(/^[0-9a-f]{64}$/),
    fetchedAt: z.string().min(1),
    status: z.enum(['fresh', 'cached-offline', 'cached-refresh-failed']),
    nodes: z.array(catalogNodeDefinitionSchema).max(500),
  })
  .strict();

export type CatalogObjectSchema = z.infer<typeof catalogObjectSchema>;
export type CatalogCapability = z.infer<typeof catalogCapabilitySchema>;
export type CatalogNodeDefinition = z.infer<typeof catalogNodeDefinitionSchema>;
export type NodeCatalogScope = z.infer<typeof nodeCatalogScopeSchema>;
export type NodeCatalogSnapshot = z.infer<typeof nodeCatalogSnapshotSchema>;
