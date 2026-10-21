import type { ProjectDocument } from '../../domain/project/project.js';
import type { NodeDefinition } from '../../domain/workflow/node-definition.js';
import {
  applyWorkflowCommand,
  type WorkflowCommand,
} from '../../domain/workflow/workflow-commands.js';
import { requiredPermissionsForWorkflow } from '../../domain/workflow/workflow-validator.js';

export function editProjectWorkflow(
  document: ProjectDocument,
  workflowPath: string,
  command: WorkflowCommand,
  catalog: readonly NodeDefinition[],
): ProjectDocument {
  const workflow = document.workflows[workflowPath];
  if (!workflow) throw new Error('Workflow not found: ' + workflowPath);
  const nextWorkflow = applyWorkflowCommand(workflow, command, catalog);
  const workflows = { ...document.workflows, [workflowPath]: nextWorkflow };
  const requiredPermissions = [
    ...new Set(
      Object.values(workflows).flatMap((candidate) =>
        requiredPermissionsForWorkflow(candidate, catalog),
      ),
    ),
  ].sort();
  const existingPermissions = new Map(
    document.manifest.permissions.map((permission) => [permission.id, permission]),
  );

  return {
    ...document,
    manifest: {
      ...document.manifest,
      permissions: requiredPermissions.map(
        (id) => existingPermissions.get(id) ?? { id, reason: 'Required by workflow node' },
      ),
    },
    workflows,
  };
}
