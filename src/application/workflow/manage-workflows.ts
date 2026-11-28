import type { ProjectDocument } from '@domain/project/project';
import { createDefaultWorkflowDocument } from '@domain/project/project-factory';

export type WorkflowKind = 'flow' | 'subflow';

function workflowSlug(name: string) {
  return name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function addProjectWorkflow(
  document: ProjectDocument,
  name: string,
  kind: WorkflowKind,
): { document: ProjectDocument; workflowPath: string } {
  if (document.manifest.workflows.length >= 100)
    throw new Error('A project supports up to 100 flows');
  const slug = workflowSlug(name);
  if (!slug) throw new Error('Flow name must contain a letter or number');
  const workflowPath = `workflows/${slug}.workflow.json`;
  if (document.workflows[workflowPath]) throw new Error('A flow with this name already exists');

  return {
    workflowPath,
    document: {
      ...document,
      manifest: {
        ...document.manifest,
        workflows: [...document.manifest.workflows, workflowPath],
        workflowKinds: { ...document.manifest.workflowKinds, [workflowPath]: kind },
      },
      workflows: { ...document.workflows, [workflowPath]: createDefaultWorkflowDocument() },
    },
  };
}
