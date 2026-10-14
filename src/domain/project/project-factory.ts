import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  DEFAULT_WORKFLOW_PATH,
  type ProjectDocument,
} from './project.js';

export function createEmptyProjectDocument(projectId: string, name: string): ProjectDocument {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('Project name must contain between 1 and 100 characters');
  }

  return {
    manifest: {
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      projectId,
      name: normalizedName,
      version: '0.1.0',
      entryWorkflow: DEFAULT_WORKFLOW_PATH,
      minimumRuntimeVersion: '0.1.0',
      workflows: [DEFAULT_WORKFLOW_PATH],
      assets: [],
      permissions: [],
      environment: [],
    },
    workflows: {
      [DEFAULT_WORKFLOW_PATH]: {
        schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
        id: 'main',
        name: 'Main workflow',
        nodes: [],
        edges: [],
        layout: { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } },
      },
    },
  };
}
