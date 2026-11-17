import { z } from 'zod';

import type { ProjectDocument } from '@domain/project/project';
import {
  projectManifestV1Schema,
  workflowPathSchema,
} from '@domain/project/project-manifest-schema';
import { workflowDocumentSchema } from '@domain/project/workflow-document-schema';

export const projectDocumentSchema: z.ZodType<ProjectDocument> = z
  .object({
    manifest: projectManifestV1Schema,
    workflows: z.record(workflowPathSchema, workflowDocumentSchema),
  })
  .superRefine((document, context) => {
    for (const workflowPath of document.manifest.workflows) {
      if (!document.workflows[workflowPath]) {
        context.addIssue({ code: 'custom', message: `Missing workflow: ${workflowPath}` });
      }
    }
  });
