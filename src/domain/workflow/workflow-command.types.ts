import type { WorkflowBinding, WorkflowNode } from '@domain/project/project';
import type { ObjectValueSchema } from '@domain/schema/object-value-schema';
import type { JsonValue } from '@shared/types/json-value';

export type WorkflowCommand =
  | {
      type: 'node.add';
      payload: {
        nodeId: string;
        nodeType: string;
        nodeVersion: number;
        position: { x: number; y: number };
      };
    }
  | {
      type: 'node.move';
      payload: { nodeId: string; position: { x: number; y: number } };
    }
  | {
      type: 'node.updateParams';
      payload: { nodeId: string; changes: Record<string, JsonValue> };
    }
  | {
      type: 'node.commitConfiguration';
      payload: {
        nodeId: string;
        baseRevision: number;
        config: Record<string, JsonValue>;
        inputSchema: ObjectValueSchema;
        bindings: Record<string, WorkflowBinding>;
        errorPolicy: WorkflowNode['errorPolicy'];
      };
    }
  | {
      type: 'node.updateMetadata';
      payload: {
        nodeId: string;
        name?: string;
        labelMode: 'icon' | 'icon-and-name';
        description?: string;
        disabled: boolean;
      };
    }
  | { type: 'node.remove'; payload: { nodeId: string } }
  | {
      type: 'node.duplicate';
      payload: { sourceNodeId: string; nodeId: string; position?: { x: number; y: number } };
    }
  | {
      type: 'edge.connect';
      payload: {
        edgeId: string;
        source: { nodeId: string; port: string };
        target: { nodeId: string; port: string };
      };
    }
  | {
      type: 'node.addConnected';
      payload: {
        nodeId: string;
        nodeType: string;
        nodeVersion: number;
        position: { x: number; y: number };
        edgeId: string;
        source: { nodeId: string; port: string };
        targetPort: string;
      };
    }
  | {
      type: 'edge.reconnect';
      payload: {
        edgeId: string;
        source: { nodeId: string; port: string };
        target: { nodeId: string; port: string };
      };
    }
  | { type: 'edge.remove'; payload: { edgeId: string } };
