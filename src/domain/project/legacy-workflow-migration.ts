import { z } from 'zod';

import { CURRENT_WORKFLOW_SCHEMA_VERSION, type WorkflowDocument } from '@domain/project/project';
import { jsonValueSchema } from '@domain/schema/json-value-schema';

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

export function migrateLegacyWorkflow(input: unknown): WorkflowDocument | null {
  const legacy = legacyWorkflowDocumentV1Schema.safeParse(input);
  if (!legacy.success) return null;

  const unsupportedEdge = legacy.data.edges.find((edge) => edge.target.port !== 'in');
  if (unsupportedEdge) {
    throw new TypeError(
      `Legacy workflow edge ${unsupportedEdge.id} uses non-default target port '${unsupportedEdge.target.port}'`,
    );
  }

  const startNode = legacy.data.nodes.find(
    (node) => node.type === 'flow.start' || node.type === 'trigger.start',
  );
  const errorBranchNodeIds = new Set(
    legacy.data.edges
      .filter((edge) => edge.source.port === 'error')
      .map((edge) => edge.source.nodeId),
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
      editor: legacy.data.layout.nodes[node.id] ?? { x: 0, y: 0 },
      bindings: Object.fromEntries(
        Object.entries(node.params).map(([name, value]) => [name, { kind: 'LITERAL', value }]),
      ),
      errorPolicy: errorBranchNodeIds.has(node.id) ? 'ERROR_BRANCH' : 'STOP',
    })),
    edges: legacy.data.edges.map((edge) => ({
      id: edge.id,
      sourcePort: edge.source.port,
      sourceNodeId: edge.source.nodeId,
      targetNodeId: edge.target.nodeId,
    })),
  };
}
