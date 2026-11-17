import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  DEFAULT_WORKFLOW_PATH,
  type ProjectDocument,
} from '@domain/project/project';

export function createEmptyProjectDocument(
  projectId: string,
  name: string,
  description?: string,
): ProjectDocument {
  const normalizedName = name.trim();
  const normalizedDescription = description?.trim() || undefined;
  if (!normalizedName || normalizedName.length > 255) {
    throw new Error('Project name must contain between 1 and 255 characters');
  }
  if (normalizedDescription && normalizedDescription.length > 4_000) {
    throw new Error('Project description must not exceed 4,000 characters');
  }

  const startNodeId = crypto.randomUUID();
  return {
    manifest: {
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      projectId,
      name: normalizedName,
      ...(normalizedDescription ? { description: normalizedDescription } : {}),
      version: '0.1.0',
      entryWorkflow: DEFAULT_WORKFLOW_PATH,
      minimumRuntimeVersion: '0.1.0',
      workflows: [DEFAULT_WORKFLOW_PATH],
      workflowKinds: { [DEFAULT_WORKFLOW_PATH]: 'flow' },
      assets: [],
      permissions: [],
      environment: [],
    },
    workflows: {
      [DEFAULT_WORKFLOW_PATH]: {
        schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
        entryNodeId: startNodeId,
        nodes: [
          {
            id: startNodeId,
            type: 'flow.start',
            config: {},
            editor: { x: 100, y: 180 },
            bindings: {},
            errorPolicy: 'STOP',
          },
        ],
        edges: [],
      },
    },
  };
}
