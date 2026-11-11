import axios from 'axios';

import {
  EDITOR_GRAPH_MAX_CONTENT_BYTES,
  WorkflowValidationError,
  workflowValidationResponseSchema,
  type WorkflowValidationRemoteGateway,
} from '@application/workflow-validation/workflow-validation';
import request from '@electron/main/api/request';

const MAX_TRANSPORT_BYTES = 2 * 1024 * 1024;

export function parseWorkflowValidationResponse(input: unknown) {
  const parsed = workflowValidationResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkflowValidationError(
      'WORKFLOW_VALIDATION_INVALID_RESPONSE',
      'The workflow validation service returned an invalid response.',
      true,
    );
  }
  return parsed.data.data;
}

function serializedEditorGraph(editorGraph: Record<string, unknown>) {
  let serialized: string;
  try {
    serialized = JSON.stringify(editorGraph);
  } catch {
    throw new WorkflowValidationError(
      'WORKFLOW_VALIDATION_INVALID_REQUEST',
      'The Editor Graph could not be serialized as JSON.',
      false,
    );
  }
  if (Buffer.byteLength(serialized, 'utf8') > EDITOR_GRAPH_MAX_CONTENT_BYTES) {
    throw new WorkflowValidationError(
      'WORKFLOW_VALIDATION_PAYLOAD_TOO_LARGE',
      'The Editor Graph exceeds the 1 MiB validation limit.',
      false,
    );
  }
  return serialized;
}

async function validateRemote(input: Parameters<WorkflowValidationRemoteGateway['validate']>[0]) {
  serializedEditorGraph(input.editorGraph);

  try {
    const response = await request({
      url: '/api/v1/workflow-validation',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      data: { editorGraph: input.editorGraph },
      maxBodyLength: MAX_TRANSPORT_BYTES,
      maxContentLength: MAX_TRANSPORT_BYTES,
    });
    return parseWorkflowValidationResponse(response.data);
  } catch (error) {
    if (error instanceof WorkflowValidationError) throw error;
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401) {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_SESSION_EXPIRED',
          'The authenticated session is no longer valid.',
          false,
        );
      }
      if (status === 403) {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_FORBIDDEN',
          'The authenticated account cannot validate this workflow.',
          false,
        );
      }
      if (status === 413 || error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_PAYLOAD_TOO_LARGE',
          'The Editor Graph exceeds the validation service size limit.',
          false,
        );
      }
      if (status === 400 || status === 422) {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_INVALID_REQUEST',
          'The validation service rejected the request envelope.',
          false,
        );
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_TIMEOUT',
          'The workflow validation request timed out.',
          true,
        );
      }
      if (status !== undefined) {
        throw new WorkflowValidationError(
          'WORKFLOW_VALIDATION_SERVER_ERROR',
          'The workflow validation service rejected the request.',
          status >= 500 || status === 429,
        );
      }
    }
    throw new WorkflowValidationError(
      'WORKFLOW_VALIDATION_NETWORK_UNAVAILABLE',
      'Unable to reach the workflow validation service.',
      true,
    );
  }
}

export function createWorkflowValidationApi(): WorkflowValidationRemoteGateway {
  return { validate: validateRemote };
}
