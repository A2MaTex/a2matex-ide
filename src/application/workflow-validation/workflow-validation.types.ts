import type { z } from 'zod';

import type {
  workflowValidationDiagnosticSchema,
  workflowValidationInputSchema,
  workflowValidationOutputSchema,
} from '@application/workflow-validation/workflow-validation.schema';

export type WorkflowValidationInput = z.infer<typeof workflowValidationInputSchema>;
export type WorkflowValidationDiagnostic = z.infer<typeof workflowValidationDiagnosticSchema>;
export type WorkflowValidationOutput = z.infer<typeof workflowValidationOutputSchema>;

export interface WorkflowValidationRemoteGateway {
  validate(input: {
    accessToken: string;
    editorGraph: WorkflowValidationInput['editorGraph'];
  }): Promise<WorkflowValidationOutput>;
}

export interface WorkflowValidationClient {
  validate(input: WorkflowValidationInput): Promise<WorkflowValidationOutput>;
}
