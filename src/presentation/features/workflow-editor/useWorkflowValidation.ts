import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type {
  WorkflowValidationErrorCode,
  WorkflowValidationOutput,
} from '@application/workflow-validation/workflow-validation';
import { encodeWorkflowDocument } from '@domain/project/project-schema';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';
import { useProjectStoreApi } from '@presentation/features/project-session/use-project-store';
import { useEditorStore } from '@presentation/stores/editor-store';
import type { JsonValue } from '@shared/types/json-value';

export type WorkflowValidationRunErrorCode =
  | WorkflowValidationErrorCode
  | 'WORKFLOW_VALIDATION_LOCAL_SAVE_FAILED'
  | 'WORKFLOW_VALIDATION_PENDING_CONFIGURATION'
  | 'WORKFLOW_VALIDATION_PREPARATION_FAILED'
  | 'WORKFLOW_VALIDATION_DESKTOP_UNAVAILABLE';

export interface WorkflowValidationRunError {
  code: WorkflowValidationRunErrorCode;
  message: string;
  retryable: boolean;
}

export type WorkflowValidationRunState =
  | { phase: 'idle' }
  | { phase: 'saving'; projectId: string; workflowPath: string }
  | { phase: 'validating'; projectId: string; workflowPath: string; revision: number }
  | {
      phase: 'completed';
      projectId: string;
      workflowPath: string;
      revision: number;
      output: WorkflowValidationOutput;
      stale: boolean;
    }
  | {
      phase: 'failed';
      projectId: string;
      workflowPath: string;
      revision?: number;
      error: WorkflowValidationRunError;
    };

interface ValidationContext {
  projectId: string | null;
  workflowPath: string;
}

function sameContext(left: ValidationContext, right: ValidationContext) {
  return left.projectId === right.projectId && left.workflowPath === right.workflowPath;
}

function preparationError(message: string): WorkflowValidationRunError {
  return {
    code: 'WORKFLOW_VALIDATION_PREPARATION_FAILED',
    message,
    retryable: false,
  };
}

export function useWorkflowValidation(workflowPath: string) {
  const store = useProjectStoreApi();
  const session = useProjectStore((state) => state.session);
  const setActiveBottomTab = useEditorStore((state) => state.setActiveBottomTab);
  const projectId = session?.snapshot.localId ?? null;
  const currentRevision = session?.workingRevision ?? null;
  const [rawState, setRawState] = useState<WorkflowValidationRunState>({ phase: 'idle' });
  const runIdRef = useRef(0);
  const contextRef = useRef<ValidationContext>({ projectId, workflowPath });

  useLayoutEffect(() => {
    contextRef.current = { projectId, workflowPath };
    runIdRef.current += 1;
  }, [projectId, workflowPath]);

  const validate = useCallback(async () => {
    setActiveBottomTab('diagnostics');
    const startingState = store.getState();
    const startingSession = startingState.session;
    const startingProjectId = startingSession?.snapshot.localId ?? null;
    const validationContext = { projectId: startingProjectId, workflowPath };
    const runId = ++runIdRef.current;

    if (!startingSession || !startingProjectId || !workflowPath) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId ?? '',
        workflowPath,
        error: preparationError('Open a workflow before validating it.'),
      });
      return;
    }

    if (startingState.pendingNodeConfigurationId) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: {
          code: 'WORKFLOW_VALIDATION_PENDING_CONFIGURATION',
          message: 'Save or discard the pending node configuration before validating.',
          retryable: false,
        },
      });
      return;
    }

    setRawState({ phase: 'saving', projectId: startingProjectId, workflowPath });
    const saved = await startingState.flushLocalSave();
    if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) return;

    const savedState = store.getState();
    const savedSession = savedState.session;
    if (!saved || !savedSession || savedSession.snapshot.localId !== startingProjectId) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: {
          code: 'WORKFLOW_VALIDATION_LOCAL_SAVE_FAILED',
          message:
            savedState.localSaveError ??
            'The workflow could not be saved locally, so validation was not started.',
          retryable: true,
        },
      });
      return;
    }

    if (savedSession.workingRevision !== savedSession.savedRevision) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: {
          code: 'WORKFLOW_VALIDATION_LOCAL_SAVE_FAILED',
          message:
            'The workflow changed while it was being saved. Validate the current revision again.',
          retryable: true,
        },
      });
      return;
    }

    const workflow = savedSession.snapshot.document.workflows[workflowPath];
    if (!workflow) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: preparationError('The selected workflow no longer exists in the saved project.'),
      });
      return;
    }

    let editorGraph: Record<string, JsonValue>;
    try {
      editorGraph = JSON.parse(JSON.stringify(encodeWorkflowDocument(workflow))) as Record<
        string,
        JsonValue
      >;
    } catch {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision: savedSession.savedRevision,
        error: preparationError(
          'The saved workflow could not be encoded for validation. Check its connection targets.',
        ),
      });
      return;
    }

    const revision = savedSession.savedRevision;
    setRawState({
      phase: 'validating',
      projectId: startingProjectId,
      workflowPath,
      revision,
    });

    if (!window.studioHost) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision,
        error: {
          code: 'WORKFLOW_VALIDATION_DESKTOP_UNAVAILABLE',
          message: 'Workflow validation is only available in the desktop app.',
          retryable: false,
        },
      });
      return;
    }

    let result;
    try {
      result = await window.studioHost.workflowValidation.validate({ editorGraph });
    } catch {
      if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) return;
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision,
        error: {
          code: 'WORKFLOW_VALIDATION_UNKNOWN_ERROR',
          message: 'The desktop validation bridge failed unexpectedly.',
          retryable: true,
        },
      });
      return;
    }

    if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) return;
    if (!result.ok) {
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision,
        error: result.error,
      });
      return;
    }

    setRawState({
      phase: 'completed',
      projectId: startingProjectId,
      workflowPath,
      revision,
      output: result.value,
      stale: store.getState().session?.workingRevision !== revision,
    });
  }, [setActiveBottomTab, store, workflowPath]);

  const state = useMemo<WorkflowValidationRunState>(() => {
    if (
      rawState.phase !== 'idle' &&
      (rawState.projectId !== projectId || rawState.workflowPath !== workflowPath)
    ) {
      return { phase: 'idle' };
    }
    if (rawState.phase !== 'completed') return rawState;
    return {
      ...rawState,
      stale:
        rawState.projectId !== projectId ||
        rawState.workflowPath !== workflowPath ||
        rawState.revision !== currentRevision,
    };
  }, [currentRevision, projectId, rawState, workflowPath]);

  return {
    state,
    validate,
    busy: state.phase === 'saving' || state.phase === 'validating',
  };
}
