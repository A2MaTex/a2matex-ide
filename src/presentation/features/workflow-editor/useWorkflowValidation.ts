import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation';
import type { RuntimeErrorCode } from '@application/runtime/runtime.types';
import { toRuntimeEditorGraph } from '@application/runtime/to-runtime-editor-graph';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';
import { useProjectStoreApi } from '@presentation/features/project-session/use-project-store';
import { toast } from '@presentation/components/ui/toast-store';
import { useEditorStore } from '@presentation/stores/editor-store';
import type { JsonValue } from '@shared/types/json-value';

export type WorkflowValidationRunErrorCode =
  | RuntimeErrorCode
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
  const pendingNodeConfigurationId = useProjectStore((state) => state.pendingNodeConfigurationId);
  const [rawState, setRawState] = useState<WorkflowValidationRunState>({ phase: 'idle' });
  const [automaticEnabled, setAutomaticEnabled] = useState(false);
  const runIdRef = useRef(0);
  const lastRequestedRevisionRef = useRef<number | null>(null);
  const contextRef = useRef<ValidationContext>({ projectId, workflowPath });

  useLayoutEffect(() => {
    contextRef.current = { projectId, workflowPath };
    runIdRef.current += 1;
    lastRequestedRevisionRef.current = null;
  }, [projectId, workflowPath]);

  useEffect(() => {
    if (!window.studioHost) return;
    return window.studioHost.runtime.onStatusChanged((status) => {
      if (status.state === 'STOPPING') setAutomaticEnabled(false);
    });
  }, []);

  const validate = useCallback(async () => {
    setActiveBottomTab('diagnostics');
    const startingState = store.getState();
    const startingSession = startingState.session;
    const startingProjectId = startingSession?.snapshot.localId ?? null;
    const validationContext = { projectId: startingProjectId, workflowPath };
    const runId = ++runIdRef.current;

    if (!startingSession || !startingProjectId || !workflowPath) {
      const message = 'Open a workflow before validating it.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId ?? '',
        workflowPath,
        error: preparationError(message),
      });
      toast.error('Validation not started', { description: message });
      return;
    }

    if (startingState.pendingNodeConfigurationId) {
      const message = 'Save or discard the pending node configuration before validating.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: {
          code: 'WORKFLOW_VALIDATION_PENDING_CONFIGURATION',
          message,
          retryable: false,
        },
      });
      toast.error('Validation not started', { description: message });
      return;
    }

    setRawState({ phase: 'saving', projectId: startingProjectId, workflowPath });
    const saved = await startingState.flushLocalSave();
    if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) return;

    const savedState = store.getState();
    const savedSession = savedState.session;
    if (!saved || !savedSession || savedSession.snapshot.localId !== startingProjectId) {
      const message =
        savedState.localSaveError ??
        'The workflow could not be saved locally, so validation was not started.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: {
          code: 'WORKFLOW_VALIDATION_LOCAL_SAVE_FAILED',
          message,
          retryable: true,
        },
      });
      toast.error('Validation failed', { description: message });
      return;
    }

    if (savedSession.workingRevision !== savedSession.savedRevision) {
      const message =
        'The workflow changed while it was being saved. Validate the current revision again.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: {
          code: 'WORKFLOW_VALIDATION_LOCAL_SAVE_FAILED',
          message,
          retryable: true,
        },
      });
      toast.error('Validation failed', { description: message });
      return;
    }

    const workflow = savedSession.snapshot.document.workflows[workflowPath];
    if (!workflow) {
      const message = 'The selected workflow no longer exists in the saved project.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        error: preparationError(message),
      });
      toast.error('Validation failed', { description: message });
      return;
    }

    let editorGraph: Record<string, JsonValue>;
    try {
      editorGraph = toRuntimeEditorGraph(workflow);
    } catch {
      const message =
        'The saved workflow could not be encoded for validation. Check its connection targets.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision: savedSession.savedRevision,
        error: preparationError(message),
      });
      toast.error('Validation failed', { description: message });
      return;
    }

    const revision = savedSession.savedRevision;
    lastRequestedRevisionRef.current = revision;
    setAutomaticEnabled(true);
    setRawState({
      phase: 'validating',
      projectId: startingProjectId,
      workflowPath,
      revision,
    });

    if (!window.studioHost) {
      const message = 'Workflow validation is only available in the desktop app.';
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision,
        error: {
          code: 'WORKFLOW_VALIDATION_DESKTOP_UNAVAILABLE',
          message,
          retryable: false,
        },
      });
      toast.error('Validation failed', { description: message });
      return;
    }

    let result;
    try {
      result = await window.studioHost.runtime.validate({ editorGraph });
    } catch {
      if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) return;
      setRawState({
        phase: 'failed',
        projectId: startingProjectId,
        workflowPath,
        revision,
        error: {
          code: 'RUNTIME_UNKNOWN_ERROR',
          message: 'The desktop validation bridge failed unexpectedly.',
          retryable: true,
        },
      });
      toast.error('Validation failed', {
        description: 'The desktop validation bridge failed unexpectedly.',
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
      toast.error('Validation failed', { description: result.error.message });
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
    if (result.value.status === 'VALID') toast.success('Workflow is valid');
    else if (result.value.status === 'VALID_WITH_WARNINGS')
      toast.warning('Validation completed with warnings');
    else
      toast.warning('Validation completed with errors', {
        description: 'Open Diagnostics for details.',
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

  useEffect(() => {
    if (
      !automaticEnabled ||
      !projectId ||
      currentRevision === null ||
      pendingNodeConfigurationId !== null ||
      lastRequestedRevisionRef.current === currentRevision
    ) {
      return;
    }
    const startingState = store.getState();
    const workflow = startingState.session?.snapshot.document.workflows[workflowPath];
    if (!workflow || !window.studioHost) return;

    const revision = currentRevision;
    const validationContext = { projectId, workflowPath };
    let editorGraph: Record<string, JsonValue>;
    try {
      editorGraph = toRuntimeEditorGraph(workflow);
    } catch {
      return;
    }

    const timer = window.setTimeout(() => {
      const runId = ++runIdRef.current;
      lastRequestedRevisionRef.current = revision;
      setRawState({ phase: 'validating', projectId, workflowPath, revision });
      void window
        .studioHost!.runtime.validate({ editorGraph })
        .then((result) => {
          if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) {
            return;
          }
          if (!result.ok) {
            setRawState({
              phase: 'failed',
              projectId,
              workflowPath,
              revision,
              error: result.error,
            });
            return;
          }
          setRawState({
            phase: 'completed',
            projectId,
            workflowPath,
            revision,
            output: result.value,
            stale: store.getState().session?.workingRevision !== revision,
          });
        })
        .catch(() => {
          if (runId !== runIdRef.current || !sameContext(contextRef.current, validationContext)) {
            return;
          }
          setRawState({
            phase: 'failed',
            projectId,
            workflowPath,
            revision,
            error: {
              code: 'RUNTIME_UNKNOWN_ERROR',
              message: 'Automatic local Runtime validation failed unexpectedly.',
              retryable: true,
            },
          });
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    automaticEnabled,
    currentRevision,
    pendingNodeConfigurationId,
    projectId,
    store,
    workflowPath,
  ]);

  return {
    state,
    validate,
    busy: state.phase === 'saving' || state.phase === 'validating',
  };
}
