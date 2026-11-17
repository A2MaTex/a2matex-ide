import { z } from 'zod';

import { objectValueSchema } from '@domain/schema/object-value-schema';

export const DEFAULT_NODE_CATALOG_RUNTIME_VERSION = '0.1.0';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const identifierPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

const bindingKindSchema = z.enum([
  'LITERAL',
  'WORKFLOW_INPUT',
  'NODE_OUTPUT',
  'FLOW_VARIABLE',
  'GLOBAL_VARIABLE',
]);

const catalogFieldSchema = z.record(z.string(), z.json());

export const catalogObjectSchema = z
  .object({
    type: z.literal('object'),
    properties: z.record(z.string(), catalogFieldSchema),
    required: z.array(z.string().min(1).max(100)).max(100),
    additionalProperties: z.literal(false),
    dynamicInputs: z
      .record(
        z.string(),
        z
          .object({
            bindingKeyFrom: z.string().min(1).max(255),
            operandCountFrom: z.string().min(1).max(255),
            bindingKinds: z
              .partialRecord(bindingKindSchema, z.record(z.string(), z.json()))
              .optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine(({ properties, required }, context) => {
    const seen = new Set<string>();
    for (const [index, field] of required.entries()) {
      if (seen.has(field)) {
        context.addIssue({
          code: 'custom',
          message: 'Required fields must be unique',
          path: ['required', index],
        });
      }
      seen.add(field);
      if (!Object.hasOwn(properties, field)) {
        context.addIssue({
          code: 'custom',
          message: `Required field '${field}' must exist in properties`,
          path: ['required', index],
        });
      }
    }
  });

const capabilityObjectSchema = z
  .object({
    code: z.string().min(1).max(255).regex(identifierPattern),
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(10_000),
    isSensitive: z.boolean(),
  })
  .strict();

export const catalogCapabilitySchema = z
  .union([z.string().min(1).max(255).regex(identifierPattern), capabilityObjectSchema])
  .transform((capability) =>
    typeof capability === 'string'
      ? {
          code: capability,
          name: capability,
          description: `Requires ${capability}`,
          isSensitive: false,
        }
      : capability,
  );

export const catalogTargetingSchema = z
  .object({
    modes: z
      .array(
        z
          .object({
            mode: z.string().min(1).max(100),
            bindingSchema: objectValueSchema,
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
    outputPorts: z
      .union([
        z.array(z.string().min(1).max(100)).max(100),
        z
          .object({
            ports: z.array(z.string().min(1).max(100)).max(100),
            dynamicPorts: z
              .object({ keysFrom: z.string().min(1).max(255) })
              .strict()
              .optional(),
          })
          .strict(),
      ])
      .transform((value) => (Array.isArray(value) ? { ports: value } : value)),
    targeting: catalogTargetingSchema.optional(),
    bindingKinds: z.array(bindingKindSchema).max(10).optional(),
    capabilities: z.array(catalogCapabilitySchema),
  })
  .strict()
  .superRefine((definition, context) => {
    if (new Set(definition.outputPorts.ports).size !== definition.outputPorts.ports.length) {
      context.addIssue({
        code: 'custom',
        message: 'Output ports must be unique',
        path: ['outputPorts'],
      });
    }
    if (!definition.targeting) return;
    const targetMode = definition.configSchema.properties.targetMode;
    const enumModes = Array.isArray(targetMode?.enum)
      ? targetMode.enum.filter((value): value is string => typeof value === 'string')
      : undefined;
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
export type CatalogTargeting = z.infer<typeof catalogTargetingSchema>;
export type CatalogBindingKind = z.infer<typeof bindingKindSchema>;
export type CatalogNodeDefinition = z.infer<typeof catalogNodeDefinitionSchema>;
export type NodeCatalogScope = z.infer<typeof nodeCatalogScopeSchema>;
export type NodeCatalogSnapshot = z.infer<typeof nodeCatalogSnapshotSchema>;
