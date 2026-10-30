import type { JsonValue } from '@shared/types/json-value';

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
  assets: AssetDeclaration[];
  permissions: PermissionDeclaration[];
  environment: EnvironmentVariableDeclaration[];
  publisher?: { id: string };
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: string;
  nodeVersion: number;
  name?: string;
  disabled?: boolean;
  params: Record<string, JsonValue>;
}

export interface WorkflowEdge {
  id: string;
  source: { nodeId: string; port: string };
  target: { nodeId: string; port: string };
}

export interface WorkflowDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  layout: {
    nodes: Record<string, { x: number; y: number }>;
    viewport?: { x: number; y: number; zoom: number };
  };
  metadata?: Record<string, JsonValue>;
  [key: string]: unknown;
}

export interface ProjectDocument {
  manifest: ProjectManifest;
  workflows: Record<string, WorkflowDocument>;
}
