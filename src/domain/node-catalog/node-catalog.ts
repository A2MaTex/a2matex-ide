import { z } from 'zod';

import { objectValueSchema } from '@domain/schema/object-value-schema';

export const DEFAULT_NODE_CATALOG_RUNTIME_VERSION = '0.1.0';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const identifierPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export const catalogObjectSchema = objectValueSchema;

export const catalogCapabilitySchema = z
  .object({
    code: z.string().min(1).max(255).regex(identifierPattern),
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(10_000),
    isSensitive: z.boolean(),
  })
  .strict();

export const catalogTargetingSchema = z
  .object({
    modes: z
      .array(
        z
          .object({
            mode: z.string().min(1).max(100),
            bindingSchema: catalogObjectSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine(({ modes }, context) => {
    const seen = new Set<string>();
    for (const [index, { mode }] of modes.entries()) {
      if (seen.has(mode)) {
        context.addIssue({
          code: 'custom',
          message: `Target mode '${mode}' must be unique`,
          path: ['modes', index, 'mode'],
        });
      }
      seen.add(mode);
    }
  });

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
    outputPorts: z.array(z.string().min(1).max(64)).max(100),
    targeting: catalogTargetingSchema.optional(),
    capabilities: z.array(catalogCapabilitySchema),
  })
  .strict()
  .superRefine((definition, context) => {
    if (new Set(definition.outputPorts).size !== definition.outputPorts.length) {
      context.addIssue({
        code: 'custom',
        message: 'Output ports must be unique',
        path: ['outputPorts'],
      });
    }
    if (!definition.targeting) return;
    const targetMode = definition.configSchema.properties.targetMode;
    const enumModes = targetMode?.type === 'string' ? targetMode.enum : undefined;
    const declaredModes = definition.targeting.modes.map(({ mode }) => mode);
    const enumModeSet = new Set(enumModes);
    if (
      !enumModes ||
      enumModeSet.size !== enumModes.length ||
      enumModes.length !== declaredModes.length ||
      enumModes.some((mode) => !declaredModes.includes(mode))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'targetMode enum must match targeting modes one-to-one',
        path: ['configSchema', 'properties', 'targetMode', 'enum'],
      });
    }
    if (!definition.configSchema.required.includes('targetMode')) {
      context.addIssue({
        code: 'custom',
        message: 'Targeting nodes must require targetMode',
        path: ['configSchema', 'required'],
      });
    }
  });

export const nodeCatalogScopeSchema = z
  .object({
    server: z.string().url(),
    account: z.string().min(1).max(320),
    runtimeVersion: z.string().regex(semverPattern),
  })
  .strict();

export const nodeCatalogSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    scope: nodeCatalogScopeSchema,
    catalogHash: z.string().regex(/^[0-9a-f]{64}$/),
    fetchedAt: z.string().min(1),
    status: z.enum(['fresh', 'cached-offline', 'cached-refresh-failed']),
    nodes: z.array(catalogNodeDefinitionSchema).max(500),
  })
  .strict();

export type CatalogObjectSchema = z.infer<typeof catalogObjectSchema>;
export type CatalogCapability = z.infer<typeof catalogCapabilitySchema>;
export type CatalogTargeting = z.infer<typeof catalogTargetingSchema>;
export type CatalogNodeDefinition = z.infer<typeof catalogNodeDefinitionSchema>;
export type NodeCatalogScope = z.infer<typeof nodeCatalogScopeSchema>;
export type NodeCatalogSnapshot = z.infer<typeof nodeCatalogSnapshotSchema>;
