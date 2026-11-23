import { useCallback, useEffect, useRef, useState } from 'react';

import { toRuntimeEditorGraph } from '@application/runtime/to-runtime-editor-graph';
import type {
  RuntimeRunErrorCode,
  RuntimeNodeAttempt,
  RuntimeRunPreparationPhase,
  RuntimeRunSnapshot,
  RuntimeStartDeviceInput,
  RuntimeStartRunInput,
} from '@application/runtime/runtime.types';
import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation';
import type { HostError } from '@infrastructure/electron/studio-host-api';
import {
  useProjectStore,
  useProjectStoreApi,
} from '@presentation/features/project-session/use-project-store';
import { useEditorStore } from '@presentation/stores/editor-store';

const TERMINAL_RUN_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
const POLL_INTERVAL_MS = 1_000;
const NODE_PROGRESS_RESTART_MESSAGE =
  'Restart A2MaTeX Studio to load the updated node-progress bridge and Runtime executable.';

export type TestRunExecutionPhase =
  | 'idle'
  | 'recovering'
  | 'recovery-failed'
  | 'preparing'
  | 'compiling'
  | 'starting'
  | 'running'
  | 'terminal'
  | 'uncertain'
  | 'lost'
  | 'failed';

export interface TestRunExecutionState {
  attempts: RuntimeNodeAttempt[];
  attemptsError: string | null;
  error: HostError<RuntimeRunErrorCode> | null;
  nodeLabels: Record<string, string>;
  phase: TestRunExecutionPhase;
  pollError: string | null;
  selectedAdbSerial: string | null;
  snapshot: RuntimeRunSnapshot | null;
  validation: WorkflowValidationOutput | null;
}

export type TestRunStartOutcome = 'STARTED' | 'COMPILE_INVALID' | 'FAILED' | 'UNCERTAIN';

function terminal(snapshot: RuntimeRunSnapshot) {
  return TERMINAL_RUN_STATES.has(snapshot.runGroup.status);
}

function localError(
  code: RuntimeRunErrorCode,
  message: string,
  retryable: boolean,
): HostError<RuntimeRunErrorCode> {
  return { code, message, retryable };
}

function admissionIsUncertain(error: HostError<RuntimeRunErrorCode>) {
  return (
    [
      'RUNTIME_INVALID_RESPONSE',
      'RUNTIME_SESSION_STALE',
      'RUNTIME_TIMEOUT',
      'RUNTIME_UNAVAILABLE',
      'RUN_PENDING_ADMISSION',
    ].includes(error.code) ||
    (error.httpStatus !== undefined && error.httpStatus >= 500)
  );
}

function phaseFromPreparation(phase: RuntimeRunPreparationPhase): TestRunExecutionPhase {
  if (phase === 'COMPILING') return 'compiling';
  if (phase === 'STARTING') return 'starting';
  return 'preparing';
}

const INITIAL_STATE: TestRunExecutionState = {
  attempts: [],
  attemptsError: null,
  error: null,
  nodeLabels: {},
  phase: 'idle',
  pollError: null,
  selectedAdbSerial: null,
  snapshot: null,
  validation: null,
};

function humanizeNodeType(value: string) {
  const words = value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Workflow step';
}

function nodeLabelsFromEditorGraph(editorGraph: Record<string, unknown>) {
  if (!Array.isArray(editorGraph.nodes)) return {};
  return Object.fromEntries(
    editorGraph.nodes.flatMap((value) => {
      if (!value || Array.isArray(value) || typeof value !== 'object') return [];
      const node = value as Record<string, unknown>;
      if (typeof node.id !== 'string') return [];
      const editor =
        node.editor && !Array.isArray(node.editor) && typeof node.editor === 'object'
          ? (node.editor as Record<string, unknown>)
          : null;
      const customName = typeof editor?.name === 'string' ? editor.name.trim() : '';
      const type = typeof node.type === 'string' ? node.type : '';
      return [[node.id, customName || humanizeNodeType(type)]];
    }),
  );
}

export function useTestRunExecution(projectId: string | null) {
  const store = useProjectStoreApi();
  const pendingNodeConfigurationId = useProjectStore((state) => state.pendingNodeConfigurationId);
  const setActiveBottomTab = useEditorStore((state) => state.setActiveBottomTab);
  const [state, setState] = useState<TestRunExecutionState>(INITIAL_STATE);
  const contextGenerationRef = useRef(0);
  const intentLockRef = useRef(false);
  const pendingIntentRef = useRef<RuntimeStartRunInput | null>(null);
  const activeIntentIdRef = useRef<string | null>(null);

  const applyProjectSnapshot = useCallback(
    (snapshot: HostError['projectSnapshot']) => {
      if (snapshot) store.getState().applyRuntimeProjectSnapshot(snapshot);
    },
    [store],
  );

  const recoverForGeneration = useCallback(
    async (generation: number) => {
      await Promise.resolve();
      if (generation !== contextGenerationRef.current || !projectId) return;
      const host = window.studioHost;
      if (!host) {
        intentLockRef.current = true;
        setState({
          ...INITIAL_STATE,
          phase: 'recovery-failed',
          error: localError(
            'RUNTIME_UNAVAILABLE',
            'Test Run recovery is only available in the desktop app.',
            false,
          ),
        });
        return;
      }
      intentLockRef.current = true;
      setState({ ...INITIAL_STATE, phase: 'recovering' });
      try {
        const result = await host.runtime.getActiveRun();
        if (generation !== contextGenerationRef.current) return;
        if (!result.ok) {
          setState({ ...INITIAL_STATE, phase: 'recovery-failed', error: result.error });
          return;
        }
        if (!result.value.found) {
          intentLockRef.current = false;
          setState(INITIAL_STATE);
          return;
        }
        const snapshot = result.value.snapshot;
        const project = store.getState().session?.snapshot.document;
        const workflow = project?.workflows[project.manifest.entryWorkflow];
        intentLockRef.current = !terminal(snapshot);
        setState({
          ...INITIAL_STATE,
          nodeLabels: workflow ? nodeLabelsFromEditorGraph(toRuntimeEditorGraph(workflow)) : {},
          phase: terminal(snapshot) ? 'terminal' : 'running',
          selectedAdbSerial: snapshot.deviceExecutions[0]?.adbSerial ?? null,
          snapshot,
        });
        setActiveBottomTab('output');
      } catch {
        if (generation !== contextGenerationRef.current) return;
        setState({
          ...INITIAL_STATE,
          phase: 'recovery-failed',
          error: localError(
            'RUNTIME_UNKNOWN_ERROR',
            'The desktop Runtime recovery bridge failed unexpectedly.',
            true,
          ),
        });
      }
    },
    [projectId, setActiveBottomTab, store],
  );

  const recover = useCallback(
    () => recoverForGeneration(contextGenerationRef.current),
    [recoverForGeneration],
  );

  useEffect(() => {
    const generation = contextGenerationRef.current + 1;
    contextGenerationRef.current = generation;
    pendingIntentRef.current = null;
    activeIntentIdRef.current = null;
    intentLockRef.current = false;
    if (projectId) void recoverForGeneration(generation);
    return () => {
      if (contextGenerationRef.current === generation) contextGenerationRef.current += 1;
    };
  }, [projectId, recoverForGeneration]);

  useEffect(() => {
    const host = window.studioHost;
    if (!host) return;
    return host.runtime.onRunPreparationChanged((event) => {
      if (!event.clientIntentId || event.clientIntentId !== activeIntentIdRef.current) return;
      setState((current) => ({ ...current, phase: phaseFromPreparation(event.phase) }));
    });
  }, []);

  const submitIntent = useCallback(
    async (intent: RuntimeStartRunInput): Promise<TestRunStartOutcome> => {
      const host = window.studioHost;
      if (!host) {
        const error = localError(
          'RUNTIME_UNAVAILABLE',
          'Test Runs are only available in the desktop app.',
          false,
        );
        pendingIntentRef.current = null;
        activeIntentIdRef.current = null;
        intentLockRef.current = false;
        setState({ ...INITIAL_STATE, phase: 'failed', error });
        return 'FAILED';
      }

      activeIntentIdRef.current = intent.clientIntentId ?? null;
      setState({
        ...INITIAL_STATE,
        nodeLabels: nodeLabelsFromEditorGraph(intent.editorGraph),
        phase: 'preparing',
        selectedAdbSerial: intent.adbSerial,
      });
      try {
        const result = await host.runtime.startRun(intent);
        if (store.getState().session?.snapshot.localId !== intent.projectId) return 'FAILED';
        if (!result.ok) {
          applyProjectSnapshot(result.error.projectSnapshot);
          const uncertain = admissionIsUncertain(result.error);
          if (!uncertain) {
            pendingIntentRef.current = null;
            activeIntentIdRef.current = null;
            intentLockRef.current = false;
          }
          setState({
            ...INITIAL_STATE,
            nodeLabels: nodeLabelsFromEditorGraph(intent.editorGraph),
            phase: uncertain ? 'uncertain' : 'failed',
            selectedAdbSerial: intent.adbSerial,
            error: result.error,
            validation: result.error.validation ?? null,
          });
          setActiveBottomTab('output');
          return uncertain ? 'UNCERTAIN' : 'FAILED';
        }
        if (result.value.outcome === 'COMPILE_INVALID') {
          pendingIntentRef.current = null;
          activeIntentIdRef.current = null;
          intentLockRef.current = false;
          setState({
            ...INITIAL_STATE,
            nodeLabels: nodeLabelsFromEditorGraph(intent.editorGraph),
            phase: 'failed',
            selectedAdbSerial: intent.adbSerial,
            validation: result.value.validation,
            error: localError(
              'RUNTIME_REQUEST_REJECTED',
              'Compilation completed with validation errors.',
              false,
            ),
          });
          setActiveBottomTab('output');
          return 'COMPILE_INVALID';
        }

        applyProjectSnapshot(result.value.projectSnapshot);
        pendingIntentRef.current = null;
        activeIntentIdRef.current = null;
        const snapshot = result.value.snapshot;
        intentLockRef.current = !terminal(snapshot);
        setState({
          ...INITIAL_STATE,
          nodeLabels: nodeLabelsFromEditorGraph(intent.editorGraph),
          phase: terminal(snapshot) ? 'terminal' : 'running',
          selectedAdbSerial: intent.adbSerial,
          snapshot,
        });
        setActiveBottomTab('output');
        return 'STARTED';
      } catch {
        if (store.getState().session?.snapshot.localId !== intent.projectId) return 'FAILED';
        const error = localError(
          'RUNTIME_UNKNOWN_ERROR',
          'The desktop Test Run bridge failed unexpectedly.',
          true,
        );
        setState({
          ...INITIAL_STATE,
          nodeLabels: nodeLabelsFromEditorGraph(intent.editorGraph),
          phase: 'uncertain',
          selectedAdbSerial: intent.adbSerial,
          error,
        });
        setActiveBottomTab('output');
        return 'UNCERTAIN';
      }
    },
    [applyProjectSnapshot, setActiveBottomTab, store],
  );

  const start = useCallback(
    async (device: RuntimeStartDeviceInput): Promise<TestRunStartOutcome> => {
      if (intentLockRef.current) return 'FAILED';
      intentLockRef.current = true;
      if (typeof window.studioHost?.runtime.getNodeAttempts !== 'function') {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
          selectedAdbSerial: device.adbSerial,
          error: localError('RUNTIME_INCOMPATIBLE', NODE_PROGRESS_RESTART_MESSAGE, false),
        });
        setActiveBottomTab('output');
        return 'FAILED';
      }
      const startingState = store.getState();
      const startingSession = startingState.session;
      if (!startingSession || startingSession.snapshot.localId !== projectId) {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
          error: localError('PROJECT_NOT_FOUND', 'The open project is no longer available.', false),
        });
        return 'FAILED';
      }
      if (startingState.pendingNodeConfigurationId) {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
          error: localError(
            'RUNTIME_INVALID_REQUEST',
            'Save or discard the pending node configuration before starting a Test Run.',
            false,
          ),
        });
        return 'FAILED';
      }

      setState({
        ...INITIAL_STATE,
        phase: 'preparing',
        selectedAdbSerial: device.adbSerial,
      });
      if (!(await startingState.flushLocalSave())) {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
          selectedAdbSerial: device.adbSerial,
          error: localError(
            'LOCAL_REVISION_CONFLICT',
            store.getState().localSaveError ??
              'The workflow could not be saved locally before the Test Run.',
            true,
          ),
        });
        return 'FAILED';
      }

      const current = store.getState().session;
      const workflowPath = current?.snapshot.document.manifest.entryWorkflow ?? '';
      const workflow = current?.snapshot.document.workflows[workflowPath];
      const inputSchema = current?.snapshot.draftState.inputSchema;
      if (
        !current ||
        current.snapshot.localId !== projectId ||
        current.workingRevision !== current.savedRevision ||
        !workflow ||
        !inputSchema ||
        Array.isArray(inputSchema) ||
        typeof inputSchema !== 'object'
      ) {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
          selectedAdbSerial: device.adbSerial,
          error: localError(
            'LOCAL_REVISION_CONFLICT',
            'The saved entry workflow changed while the Test Run was being prepared.',
            true,
          ),
        });
        return 'FAILED';
      }

      let editorGraph;
      try {
        editorGraph = toRuntimeEditorGraph(workflow);
      } catch {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
          selectedAdbSerial: device.adbSerial,
          error: localError(
            'RUNTIME_INVALID_REQUEST',
            'The saved entry workflow could not be encoded for compilation.',
            false,
          ),
        });
        return 'FAILED';
      }

      const intent: RuntimeStartRunInput = {
        ...device,
        clientIntentId: crypto.randomUUID(),
        editorGraph,
        inputSchema,
        projectId: current.snapshot.localId,
        sourceRevision: current.snapshot.draftState.sourceRevision,
        workflowPath,
      };
      pendingIntentRef.current = intent;
      return submitIntent(intent);
    },
    [projectId, setActiveBottomTab, store, submitIntent],
  );

  const retryAdmission = useCallback(() => {
    const pending = pendingIntentRef.current;
    if (!pending) return Promise.resolve<TestRunStartOutcome>('FAILED');
    return submitIntent(pending);
  }, [submitIntent]);

  useEffect(() => {
    const snapshot = state.snapshot;
    if (state.phase !== 'running' || !snapshot || terminal(snapshot)) return;
    const runGroupId = snapshot.runGroup.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    const poll = async () => {
      const host = window.studioHost;
      if (!host || cancelled) return;
      let shouldContinue = true;
      try {
        const result = await host.runtime.getRun(runGroupId);
        if (cancelled) return;
        if (!result.ok) {
          setState((current) =>
            current.snapshot?.runGroup.id === runGroupId
              ? { ...current, pollError: result.error.message }
              : current,
          );
        } else if (!result.value.found) {
          shouldContinue = false;
          setState((current) =>
            current.snapshot?.runGroup.id === runGroupId
              ? {
                  ...current,
                  phase: 'lost',
                  pollError: null,
                  error: localError(
                    'RUNTIME_REQUEST_REJECTED',
                    'The saved Run result is not available in the current Runtime store.',
                    true,
                  ),
                }
              : current,
          );
        } else {
          const next = result.value.snapshot;
          const finished = terminal(next);
          shouldContinue = !finished;
          if (finished) intentLockRef.current = false;
          setState((current) =>
            current.snapshot?.runGroup.id === runGroupId
              ? {
                  ...current,
                  phase: finished ? 'terminal' : 'running',
                  pollError: null,
                  snapshot: next,
                }
              : current,
          );
        }
      } catch {
        if (cancelled) return;
        setState((current) =>
          current.snapshot?.runGroup.id === runGroupId
            ? { ...current, pollError: 'Unable to refresh the Run snapshot.' }
            : current,
        );
      }
      if (!cancelled && shouldContinue) schedule();
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state.phase, state.snapshot]);

  useEffect(() => {
    const snapshot = state.snapshot;
    const execution = snapshot?.deviceExecutions[0];
    if (!snapshot || !execution) return;
    const runGroupId = snapshot.runGroup.id;
    const deviceExecutionId = execution.id;
    let cancelled = false;

    const loadAttempts = async () => {
      const host = window.studioHost;
      if (!host) return;
      if (typeof host.runtime.getNodeAttempts !== 'function') {
        setState((current) =>
          current.snapshot?.runGroup.id === runGroupId
            ? { ...current, attemptsError: NODE_PROGRESS_RESTART_MESSAGE }
            : current,
        );
        return;
      }
      const attempts: RuntimeNodeAttempt[] = [];
      let afterSequence = 0;
      try {
        for (;;) {
          const result = await host.runtime.getNodeAttempts({
            deviceExecutionId,
            afterSequence,
            limit: 100,
          });
          if (cancelled) return;
          if (!result.ok) {
            const message =
              result.error.httpStatus === 404 && result.error.runtimeCode === 'RESOURCE_NOT_FOUND'
                ? NODE_PROGRESS_RESTART_MESSAGE
                : result.error.message;
            setState((current) =>
              current.snapshot?.runGroup.id === runGroupId
                ? { ...current, attemptsError: message }
                : current,
            );
            return;
          }
          attempts.push(...result.value.attempts);
          const next = result.value.nextAfterSequence;
          if (next === null) break;
          if (next <= afterSequence) throw new Error('Attempt pagination did not advance.');
          afterSequence = next;
        }
        setState((current) =>
          current.snapshot?.runGroup.id === runGroupId
            ? { ...current, attempts, attemptsError: null }
            : current,
        );
      } catch {
        if (cancelled) return;
        setState((current) =>
          current.snapshot?.runGroup.id === runGroupId
            ? { ...current, attemptsError: 'Unable to refresh node progress.' }
            : current,
        );
      }
    };

    void loadAttempts();
    return () => {
      cancelled = true;
    };
  }, [state.snapshot]);

  const runtimeStopped = useCallback(() => {
    const interrupted = intentLockRef.current;
    intentLockRef.current = false;
    pendingIntentRef.current = null;
    activeIntentIdRef.current = null;
    setState(
      interrupted
        ? {
            ...INITIAL_STATE,
            phase: 'failed',
            error: localError(
              'RUNTIME_UNAVAILABLE',
              'The local Runtime was stopped. Any active Test Run was interrupted.',
              true,
            ),
          }
        : INITIAL_STATE,
    );
  }, []);

  const busy = ['preparing', 'compiling', 'starting'].includes(state.phase);
  const unresolved = [
    'recovering',
    'recovery-failed',
    'preparing',
    'compiling',
    'starting',
    'running',
    'uncertain',
    'lost',
  ].includes(state.phase);
  const runButtonLabel =
    state.phase === 'preparing'
      ? 'Preparing…'
      : state.phase === 'compiling'
        ? 'Compiling…'
        : state.phase === 'starting'
          ? 'Starting…'
          : state.phase === 'running'
            ? 'Running…'
            : state.phase === 'recovering'
              ? 'Recovering…'
              : 'Run';

  return {
    busy,
    pendingNodeConfigurationId,
    recover,
    retryAdmission,
    runButtonLabel,
    runtimeStopped,
    start,
    state,
    unresolved,
  };
}
