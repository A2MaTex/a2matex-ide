import {
  WorkflowValidationService,
  type WorkflowValidationClient,
} from '@application/workflow-validation/workflow-validation';
import { createWorkflowValidationApi } from '@electron/main/api/workflow-validation.api';
import type { MainAuthClient } from '@electron/main/auth/create-auth-session-service';

export function createWorkflowValidationService(input: {
  auth: MainAuthClient;
}): WorkflowValidationClient {
  return new WorkflowValidationService(createWorkflowValidationApi(), input.auth);
}
