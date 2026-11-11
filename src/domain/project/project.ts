import type { JsonValue } from '@shared/types/json-value';
import type { ObjectValueSchema } from '@domain/schema/object-value-schema';

export const CURRENT_PROJECT_SCHEMA_VERSION = 1;
export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1;
export const PROJECT_MANIFEST_FILE = 'a2matex.project.json';
export const DEFAULT_WORKFLOW_PATH = 'workflows/main.workflow.json';

export interface AssetDeclaration {
  path: string;
  type: 'data' | 'image';
}

export interface PermissionDeclaration {
  id: string;
  reason?: string;
}

export interface EnvironmentVariableDeclaration {
  name: string;
  type: 'boolean' | 'json' | 'number' | 'string';
  default?: JsonValue;
  secret?: boolean;
}

export interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  description?: string;
  version: string;
  entryWorkflow: string;
  minimumRuntimeVersion: string;
  workflows: string[];
  workflowKinds?: Record<string, 'flow' | 'subflow'>;
  assets: AssetDeclaration[];
  permissions: PermissionDeclaration[];
  environment: EnvironmentVariableDeclaration[];
  publisher?: { id: string };
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: string;
  name?: string;
  labelMode?: 'icon' | 'icon-and-name';
  description?: string;
  disabled?: boolean;
  config: Record<string, JsonValue>;
  inputSchema: ObjectValueSchema;
  editor: { x: number; y: number };
  bindings: Record<string, WorkflowBinding>;
  errorPolicy: 'ERROR_BRANCH' | 'STOP';
}

export interface WorkflowBinding {
  kind: string;
  [key: string]: JsonValue;
}

export interface WorkflowEdge {
  id: string;
  sourcePort: string;
  sourceNodeId: string;
  targetPort?: string;
  targetNodeId: string;
}

export interface WorkflowDocument {
  schemaVersion: 1;
  entryNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ProjectDocument {
  manifest: ProjectManifest;
  workflows: Record<string, WorkflowDocument>;
}
