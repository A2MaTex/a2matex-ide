import { z } from 'zod';

import { CURRENT_PROJECT_SCHEMA_VERSION, type ProjectManifest } from '@domain/project/project';
import { projectManifestV1Schema, workflowDocumentV1Schema } from '@domain/project/project-schema';

export class ProjectFormatError extends Error {
  readonly code: 'PROJECT_FORMAT_INVALID' | 'PROJECT_SCHEMA_UNSUPPORTED';

  constructor(code: 'PROJECT_FORMAT_INVALID' | 'PROJECT_SCHEMA_UNSUPPORTED', message: string) {
    super(message);
    this.code = code;
    this.name = 'ProjectFormatError';
  }
}

const legacyManifestV0Schema = z
  .object({
    schemaVersion: z.literal(0),
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string(),
    entryWorkflow: z.string().default('workflows/main.workflow.json'),
    workflows: z.array(z.string()).default(['workflows/main.workflow.json']),
  })
  .passthrough();

function schemaVersionOf(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const version = Reflect.get(value, 'schemaVersion');
  return typeof version === 'number' ? version : null;
}

export function migrateProjectManifest(input: unknown): {
  manifest: ProjectManifest;
  migratedFrom?: number;
} {
  const schemaVersion = schemaVersionOf(input);

  if (schemaVersion === 0) {
    const legacy = legacyManifestV0Schema.safeParse(input);
    if (!legacy.success) {
      throw new ProjectFormatError('PROJECT_FORMAT_INVALID', 'Legacy project manifest is invalid');
    }

    const migrated = projectManifestV1Schema.parse({
      ...legacy.data,
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      projectId: legacy.data.id,
      minimumRuntimeVersion: '0.1.0',
      assets: [],
      permissions: [],
      environment: [],
      id: undefined,
    });
    delete migrated.id;
    return { manifest: migrated, migratedFrom: 0 };
  }

  if (schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      'PROJECT_SCHEMA_UNSUPPORTED',
      `Project schema ${String(schemaVersion)} is not supported`,
    );
  }

  const parsed = projectManifestV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new ProjectFormatError('PROJECT_FORMAT_INVALID', 'Project manifest is invalid');
  }
  return { manifest: parsed.data };
}

export function parseWorkflowDocument(input: unknown) {
  const version = schemaVersionOf(input);
  if (version !== 1) {
    throw new ProjectFormatError(
      'PROJECT_SCHEMA_UNSUPPORTED',
      `Workflow schema ${String(version)} is not supported`,
    );
  }
  const parsed = workflowDocumentV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new ProjectFormatError('PROJECT_FORMAT_INVALID', 'Workflow document is invalid');
  }
  return parsed.data;
}
