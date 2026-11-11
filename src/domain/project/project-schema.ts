import { z } from 'zod';

import type { JsonValue } from '@shared/types/json-value';

import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type ProjectDocument,
  type ProjectManifest,
  type WorkflowDocument,
} from '@domain/project/project';
import { emptyObjectValueSchema, objectValueSchema } from '@domain/schema/object-value-schema';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const workflowPathSchema = z
  .string()
  .regex(/^workflows\/[A-Za-z0-9._-]+\.workflow\.json$/, 'Invalid workflow path');

const assetPathSchema = z
  .string()
  .regex(/^assets\/[A-Za-z0-9._/-]+$/, 'Invalid asset path')
  .refine((value) => !value.split('/').includes('..'), 'Asset path may not traverse directories');

export const projectManifestV1Schema: z.ZodType<ProjectManifest> = z
  .object({
    schemaVersion: z.literal(CURRENT_PROJECT_SCHEMA_VERSION),
    projectId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(255),
    description: z.string().max(4_000).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    entryWorkflow: workflowPathSchema,
    minimumRuntimeVersion: z.string().min(1).max(64),
    workflows: z.array(workflowPathSchema).min(1).max(100),
    workflowKinds: z.record(workflowPathSchema, z.enum(['flow', 'subflow'])).optional(),
    assets: z
      .array(z.object({ path: assetPathSchema, type: z.enum(['data', 'image']) }).passthrough())
      .max(1_000),
    permissions: z
      .array(
        z
          .object({ id: z.string().min(1).max(128), reason: z.string().max(500).optional() })
          .passthrough(),
      )
      .max(100),
    environment: z
      .array(
        z
          .object({
            name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
            type: z.enum(['boolean', 'json', 'number', 'string']),
            default: jsonValueSchema.optional(),
            secret: z.boolean().optional(),
          })
          .passthrough(),
      )
      .max(200),
    publisher: z
      .object({ id: z.string().min(1).max(128) })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine((manifest) => manifest.workflows.includes(manifest.entryWorkflow), {
    message: 'Entry workflow must be declared in workflows',
    path: ['entryWorkflow'],
  })
  .refine(
    (manifest) =>
      !manifest.workflowKinds ||
      Object.keys(manifest.workflowKinds).every((path) => manifest.workflows.includes(path)),
    { message: 'Workflow kind references an undeclared workflow', path: ['workflowKinds'] },
  );

const workflowNodeSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.string().min(1).max(128),
    name: z.string().max(100).optional(),
    labelMode: z.enum(['icon', 'icon-and-name']).optional(),
    description: z.string().max(20_000).optional(),
    disabled: z.boolean().optional(),
    config: z.record(z.string(), jsonValueSchema),
    inputSchema: objectValueSchema,
    editor: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    bindings: z.record(
      z.string(),
      z.object({ kind: z.string().min(1).max(64) }).catchall(jsonValueSchema),
    ),
    errorPolicy: z.enum(['STOP', 'ERROR_BRANCH']),
  })
  .strict();

const workflowEdgeSchema = z
  .object({
    id: z.string().min(1).max(128),
    sourcePort: z.string().min(1).max(64),
    sourceNodeId: z.string().min(1).max(128),
    targetPort: z.string().min(1).max(64).optional(),
    targetNodeId: z.string().min(1).max(128),
  })
  .strict();

const legacyWorkflowDocumentV1Schema = z
  .object({
    schemaVersion: z.literal(CURRENT_WORKFLOW_SCHEMA_VERSION),
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(100),
    nodes: z.array(
      z
        .object({
          id: z.string().min(1).max(128),
          type: z.string().min(1).max(128),
          params: z.record(z.string(), jsonValueSchema),
          name: z.string().max(100).optional(),
          labelMode: z.enum(['icon', 'icon-and-name']).optional(),
          description: z.string().max(20_000).optional(),
          disabled: z.boolean().optional(),
        })
        .passthrough(),
    ),
    edges: z.array(
      z
        .object({
          id: z.string().min(1).max(128),
          source: z.object({ nodeId: z.string().min(1), port: z.string().min(1) }).passthrough(),
          target: z.object({ nodeId: z.string().min(1), port: z.string().min(1) }).passthrough(),
        })
        .passthrough(),
    ),
    layout: z
      .object({
        nodes: z.record(
          z.string(),
          z.object({ x: z.number().finite(), y: z.number().finite() }).passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

function migrateLegacyWorkflow(input: unknown): unknown {
  const legacy = legacyWorkflowDocumentV1Schema.safeParse(input);
  if (!legacy.success) return input;
  const startNode = legacy.data.nodes.find(
    (node) => node.type === 'flow.start' || node.type === 'trigger.start',
  );
  return {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    entryNodeId: startNode?.id ?? '',
    nodes: legacy.data.nodes.map((node) => ({
      id: node.id,
      type: node.type === 'trigger.start' ? 'flow.start' : node.type,
      ...(node.name ? { name: node.name } : {}),
      ...(node.labelMode ? { labelMode: node.labelMode } : {}),
      ...(node.description ? { description: node.description } : {}),
      ...(node.disabled ? { disabled: true } : {}),
      config: {},
      inputSchema: emptyObjectValueSchema(),
      editor: legacy.data.layout.nodes[node.id] ?? { x: 0, y: 0 },
      bindings: Object.fromEntries(
        Object.entries(node.params).map(([name, value]) => [name, { kind: 'constant', value }]),
      ),
      errorPolicy: 'STOP' as const,
    })),
    edges: legacy.data.edges.map((edge) => ({
      id: edge.id,
      sourcePort: edge.source.port,
      sourceNodeId: edge.source.nodeId,
      targetPort: edge.target.port,
      targetNodeId: edge.target.nodeId,
    })),
  };
}

function migrateMissingNodeInputSchemas(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const nodes = Reflect.get(input, 'nodes');
  if (!Array.isArray(nodes)) return input;
  let changed = false;
  const migratedNodes = nodes.map((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || 'inputSchema' in node) {
      return node;
    }
    changed = true;
    return { ...node, inputSchema: emptyObjectValueSchema() };
  });
  return changed ? { ...input, nodes: migratedNodes } : input;
}

function migrateWorkflowDocument(input: unknown): unknown {
  return migrateMissingNodeInputSchemas(migrateLegacyWorkflow(input));
}

export const workflowDocumentV1Schema: z.ZodType<WorkflowDocument> = z.preprocess(
  migrateWorkflowDocument,
  z
    .object({
      schemaVersion: z.literal(CURRENT_WORKFLOW_SCHEMA_VERSION),
      entryNodeId: z.string().max(128),
      nodes: z.array(workflowNodeSchema).max(5_000),
      edges: z.array(workflowEdgeSchema).max(10_000),
    })
    .strict(),
) as z.ZodType<WorkflowDocument>;

export const projectDocumentSchema: z.ZodType<ProjectDocument> = z
  .object({
    manifest: projectManifestV1Schema,
    workflows: z.record(workflowPathSchema, workflowDocumentV1Schema),
  })
  .superRefine((document, context) => {
    for (const workflowPath of document.manifest.workflows) {
      if (!document.workflows[workflowPath]) {
        context.addIssue({ code: 'custom', message: `Missing workflow: ${workflowPath}` });
      }
    }
  });
