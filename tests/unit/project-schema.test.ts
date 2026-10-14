import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createEmptyProjectDocument } from '@domain/project/project-factory';
import {
  migrateProjectManifest,
  parseWorkflowDocument,
  ProjectFormatError,
} from '@domain/project/project-migration';
import { projectDocumentSchema } from '@domain/project/project-schema';

function readFixture(relativePath: string) {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

describe('project schema and migrations', () => {
  it('round-trips a newly-created schema v1 project', () => {
    const project = createEmptyProjectDocument('project-1', 'First automation');

    expect(projectDocumentSchema.parse(project)).toEqual(project);
    expect(project.manifest.entryWorkflow).toBe('workflows/main.workflow.json');
  });

  it('validates the canonical minimal project fixture', () => {
    const manifest = readFixture('../fixtures/projects/minimal-valid/a2matex.project.json');
    const workflow = readFixture('../fixtures/projects/minimal-valid/workflows/main.workflow.json');

    expect(
      projectDocumentSchema.parse({
        manifest,
        workflows: { 'workflows/main.workflow.json': workflow },
      }),
    ).toMatchObject({ manifest: { projectId: 'fixture-minimal-v1' } });
  });

  it('migrates a legacy v0 manifest without losing extension fields', () => {
    const result = migrateProjectManifest({
      schemaVersion: 0,
      id: 'legacy-1',
      name: 'Legacy automation',
      version: '0.1.0',
      entryWorkflow: 'workflows/main.workflow.json',
      workflows: ['workflows/main.workflow.json'],
      vendorExtension: { retained: true },
    });

    expect(result.migratedFrom).toBe(0);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      projectId: 'legacy-1',
      vendorExtension: { retained: true },
    });
    expect(result.manifest).not.toHaveProperty('id');
  });

  it('rejects unsupported future schema versions', () => {
    expect(() => migrateProjectManifest({ schemaVersion: 2 })).toThrowError(
      expect.objectContaining<ProjectFormatError>({ code: 'PROJECT_SCHEMA_UNSUPPORTED' }),
    );
  });

  it('rejects workflows with unknown schema versions', () => {
    expect(() => parseWorkflowDocument({ schemaVersion: 99 })).toThrowError(
      expect.objectContaining<ProjectFormatError>({ code: 'PROJECT_SCHEMA_UNSUPPORTED' }),
    );
  });
});
