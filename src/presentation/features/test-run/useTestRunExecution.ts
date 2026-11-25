import { useCallback, useEffect, useRef, useState } from 'react';

import { toRuntimeEditorGraph } from '@application/runtime/to-runtime-editor-graph';
import type {
  RuntimeRunErrorCode,
  RuntimeControlState,
  RuntimeLiveAttemptFact,
  RuntimeNodeAttempt,
  RuntimeObservationEnvelope,
  RuntimeObservationHealth,
  RuntimeRetryFact,
  RuntimeRunPreparationPhase,
  RuntimeRunSnapshot,
  RuntimeStartDeviceInput,
  RuntimeStartRunInput,
  RuntimeRunAction,
} from '@application/runtime/runtime.types';
import type { WorkflowValidationOutput } from '@application/workflow-validation/workflow-validation';
import type { HostError } from '@infrastructure/electron/studio-host-api';
import { mergeRuntimeAttemptPage } from '@presentation/features/test-run/runtime-attempt-page';
import {
  useProjectStore,
  useProjectStoreApi,
} from '@presentation/features/project-session/use-project-store';
import { useEditorStore } from '@presentation/stores/editor-store';

const TERMINAL_RUN_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
const ATTEMPT_REFRESH_THROTTLE_MS = 250;
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
  attemptsAfterSequence: number;
  attemptsError: string | null;
  attemptsLoading: boolean;
  attemptsNextAfterSequence: number | null;
  attemptsRevision: number;
  controlState: RuntimeControlState | null;
  error: HostError<RuntimeRunErrorCode> | null;
  liveAttempt: RuntimeLiveAttemptFact | null;
  nodeLabels: Record<string, string>;
  observationError: string | null;
  observationHealth: RuntimeObservationHealth | null;
  observationId: string | null;
  observationVersion: number;
  pendingRetry: RuntimeRetryFact | null;
  phase: TestRunExecutionPhase;
  pollError: string | null;
  selectedDeviceExecutionId: string | null;
  selectedAttemptId: string | null;
  snapshot: RuntimeRunSnapshot | null;
  validation: WorkflowValidationOutput | null;
}

export type TestRunStartOutcome = 'STARTED' | 'COMPILE_INVALID' | 'FAILED' | 'UNCERTAIN';

function terminal(snapshot: RuntimeRunSnapshot) {
  return TERMINAL_RUN_STATES.has(snapshot.runGroup.status);
}

function unresolvedControl(state: RuntimeControlState | null) {
  return Boolean(state && ['SUBMITTING', 'PENDING', 'UNCERTAIN'].includes(state.phase));
}

function newestSnapshot(current: RuntimeRunSnapshot, candidate: RuntimeRunSnapshot | null) {
  if (!candidate || candidate.runGroup.id !== current.runGroup.id) return current;
  return BigInt(candidate.cursor) >= BigInt(current.cursor) ? candidate : current;
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
  attemptsAfterSequence: 0,
  attemptsError: null,
  attemptsLoading: false,
  attemptsNextAfterSequence: null,
  attemptsRevision: 0,
  controlState: null,
  error: null,
  liveAttempt: null,
  nodeLabels: {},
  observationError: null,
  observationHealth: null,
  observationId: null,
  observationVersion: 0,
  pendingRetry: null,
  phase: 'idle',
  pollError: null,
  selectedDeviceExecutionId: null,
  selectedAttemptId: null,
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

function defaultDeviceExecutionId(snapshot: RuntimeRunSnapshot) {
  return snapshot.deviceExecutions.at(0)?.id ?? null;
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
  const attemptFlightRef = useRef<Promise<void> | null>(null);
  const attemptGenerationRef = useRef(0);
  const attemptLastStartedAtRef = useRef(0);
  const attemptPageStackRef = useRef<number[]>([0]);
  const observationIdRef = useRef<string | null>(null);
  const observedAttemptRevisionRef = useRef(0);

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
          selectedDeviceExecutionId: defaultDeviceExecutionId(snapshot),
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
          selectedDeviceExecutionId: defaultDeviceExecutionId(snapshot),
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
          error,
        });
        setActiveBottomTab('output');
        return 'UNCERTAIN';
      }
    },
    [applyProjectSnapshot, setActiveBottomTab, store],
  );

  const start = useCallback(
    async (devices: RuntimeStartDeviceInput[]): Promise<TestRunStartOutcome> => {
      if (intentLockRef.current) return 'FAILED';
      intentLockRef.current = true;
      if (typeof window.studioHost?.runtime.getNodeAttempts !== 'function') {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
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
      });
      if (!(await startingState.flushLocalSave())) {
        intentLockRef.current = false;
        setState({
          ...INITIAL_STATE,
          phase: 'failed',
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
          error: localError(
            'RUNTIME_INVALID_REQUEST',
            'The saved entry workflow could not be encoded for compilation.',
            false,
          ),
        });
        return 'FAILED';
      }

      const intent: RuntimeStartRunInput = {
        clientIntentId: crypto.randomUUID(),
        devices: structuredClone(devices),
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

  const runGroupId = state.snapshot?.runGroup.id ?? null;

  useEffect(() => {
    if (!runGroupId) return;
    attemptPageStackRef.current = [0];
    observedAttemptRevisionRef.current = 0;
    const host = window.studioHost;
    if (
      !host ||
      typeof host.runtime.observeRun !== 'function' ||
      typeof host.runtime.onObservationChanged !== 'function'
    ) {
      setState((current) =>
        current.snapshot?.runGroup.id === runGroupId
          ? {
              ...current,
              observationError:
                'Restart A2MaTeX Studio to load the live Runtime observation bridge.',
              observationHealth: 'error',
            }
          : current,
      );
      return;
    }
    let active = true;
    let ownedObservationId: string | null = null;
    const applyEnvelope = (envelope: RuntimeObservationEnvelope) => {
      if (!active || envelope.observationId !== observationIdRef.current) return;
      const finished = terminal(envelope.view.snapshot);
      const attemptsChanged = envelope.view.attemptsRevision !== observedAttemptRevisionRef.current;
      observedAttemptRevisionRef.current = envelope.view.attemptsRevision;
      if (finished && !unresolvedControl(envelope.view.controlState)) {
        intentLockRef.current = false;
      }
      setState((current) =>
        current.snapshot?.runGroup.id === runGroupId
          ? {
              ...current,
              attemptsRevision: attemptsChanged
                ? current.attemptsRevision + 1
                : current.attemptsRevision,
              controlState: envelope.view.controlState,
              liveAttempt: envelope.view.liveAttempt,
              observationError: envelope.view.error?.message ?? null,
              observationHealth: envelope.view.health,
              observationId: envelope.observationId,
              observationVersion: envelope.version,
              pendingRetry: envelope.view.pendingRetry,
              phase: finished ? 'terminal' : 'running',
              pollError: null,
              selectedDeviceExecutionId: envelope.view.selectedDeviceExecutionId,
              snapshot: envelope.view.snapshot,
            }
          : current,
      );
    };
    const unsubscribe = host.runtime.onObservationChanged(applyEnvelope);
    void host.runtime
      .observeRun({ runGroupId })
      .then((result) => {
        if (!result.ok) {
          if (active) {
            setState((current) =>
              current.snapshot?.runGroup.id === runGroupId
                ? {
                    ...current,
                    observationError: result.error.message,
                    observationHealth: 'error',
                  }
                : current,
            );
          }
          return;
        }
        ownedObservationId = result.value.observationId;
        if (!active) {
          void host.runtime.stopObserving({ observationId: ownedObservationId });
          return;
        }
        observationIdRef.current = ownedObservationId;
        applyEnvelope(result.value.initialView);
      })
      .catch(() => {
        if (!active) return;
        setState((current) =>
          current.snapshot?.runGroup.id === runGroupId
            ? {
                ...current,
                observationError: 'Unable to start live Runtime observation.',
                observationHealth: 'error',
              }
            : current,
        );
      });
    return () => {
      active = false;
      unsubscribe();
      if (observationIdRef.current === ownedObservationId) observationIdRef.current = null;
      if (ownedObservationId)
        void host.runtime.stopObserving({ observationId: ownedObservationId });
    };
  }, [runGroupId]);

  useEffect(() => {
    if (!state.observationId || state.observationVersion < 1) return;
    const host = window.studioHost;
    if (!host || typeof host.runtime.ackObservation !== 'function') return;
    void host.runtime
      .ackObservation({
        observationId: state.observationId,
        version: state.observationVersion,
      })
      .then((result) => {
        if (result.ok) return;
        setState((current) =>
          current.observationId === state.observationId
            ? { ...current, observationError: result.error.message }
            : current,
        );
      });
  }, [state.observationId, state.observationVersion]);

  useEffect(() => {
    const deviceExecutionId = state.selectedDeviceExecutionId;
    if (!runGroupId || !deviceExecutionId) return;
    const host = window.studioHost;
    if (!host || typeof host.runtime.getNodeAttempts !== 'function') return;
    const requestGeneration = attemptGenerationRef.current + 1;
    attemptGenerationRef.current = requestGeneration;
    const currentRunGroupId = runGroupId;
    const afterSequence = state.attemptsAfterSequence;
    const relevantRevision = state.attemptsRevision;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resolveDelay: (() => void) | null = null;

    const request = async () => {
      const prior = attemptFlightRef.current;
      if (prior) await prior.catch(() => undefined);
      if (requestGeneration !== attemptGenerationRef.current) return;
      const delay = Math.max(
        0,
        ATTEMPT_REFRESH_THROTTLE_MS - (Date.now() - attemptLastStartedAtRef.current),
      );
      if (delay > 0) {
        await new Promise<void>((resolve) => {
          resolveDelay = resolve;
          timer = setTimeout(() => {
            resolveDelay = null;
            resolve();
          }, delay);
        });
      }
      if (requestGeneration !== attemptGenerationRef.current) return;
      attemptLastStartedAtRef.current = Date.now();
      setState((current) =>
        current.snapshot?.runGroup.id === currentRunGroupId &&
        current.selectedDeviceExecutionId === deviceExecutionId &&
        current.attemptsAfterSequence === afterSequence
          ? { ...current, attemptsLoading: true }
          : current,
      );
      const flight = host.runtime.getNodeAttempts({ deviceExecutionId, afterSequence, limit: 100 });
      const trackedFlight = flight.then(
        () => undefined,
        () => undefined,
      );
      attemptFlightRef.current = trackedFlight;
      try {
        const result = await flight;
        if (requestGeneration !== attemptGenerationRef.current) return;
        if (!result.ok) {
          throw new Error(
            result.error.httpStatus === 404 && result.error.runtimeCode === 'RESOURCE_NOT_FOUND'
              ? NODE_PROGRESS_RESTART_MESSAGE
              : result.error.message,
          );
        }
        let previousSequence = afterSequence;
        for (const attempt of result.value.attempts) {
          if (
            attempt.deviceExecutionId !== deviceExecutionId ||
            attempt.sequence <= previousSequence
          ) {
            throw new Error('The Runtime returned an invalid attempt page.');
          }
          previousSequence = attempt.sequence;
        }
        if (
          result.value.nextAfterSequence !== null &&
          result.value.nextAfterSequence <= afterSequence
        ) {
          throw new Error('The Runtime attempt continuation did not advance.');
        }
        setState((current) => {
          if (
            current.snapshot?.runGroup.id !== currentRunGroupId ||
            current.selectedDeviceExecutionId !== deviceExecutionId ||
            current.attemptsAfterSequence !== afterSequence ||
            current.attemptsRevision !== relevantRevision
          ) {
            return current;
          }
          const attempts = mergeRuntimeAttemptPage(current.attempts, result.value.attempts);
          const selectedAttemptId = attempts.some(
            (attempt) => attempt.id === current.selectedAttemptId,
          )
            ? current.selectedAttemptId
            : (attempts.at(0)?.id ?? null);
          return {
            ...current,
            attempts,
            attemptsError: null,
            attemptsLoading: false,
            attemptsNextAfterSequence: result.value.nextAfterSequence,
            selectedAttemptId,
          };
        });
      } catch (error) {
        if (requestGeneration !== attemptGenerationRef.current) return;
        setState((current) =>
          current.snapshot?.runGroup.id === currentRunGroupId &&
          current.selectedDeviceExecutionId === deviceExecutionId
            ? {
                ...current,
                attemptsError:
                  error instanceof Error ? error.message : 'Unable to refresh node progress.',
                attemptsLoading: false,
              }
            : current,
        );
      } finally {
        if (attemptFlightRef.current === trackedFlight) attemptFlightRef.current = null;
      }
    };

    void request();
    return () => {
      if (timer) clearTimeout(timer);
      resolveDelay?.();
      if (attemptGenerationRef.current === requestGeneration) attemptGenerationRef.current += 1;
    };
  }, [
    state.attemptsAfterSequence,
    state.attemptsRevision,
    state.selectedDeviceExecutionId,
    runGroupId,
  ]);

  const selectDeviceExecution = useCallback((deviceExecutionId: string) => {
    const observationId = observationIdRef.current;
    if (observationId) {
      void window.studioHost?.runtime.selectObservedDevice({ observationId, deviceExecutionId });
    }
    attemptPageStackRef.current = [0];
    attemptGenerationRef.current += 1;
    setState((current) => {
      if (
        !current.snapshot?.deviceExecutions.some((execution) => execution.id === deviceExecutionId)
      ) {
        return current;
      }
      return {
        ...current,
        attempts: [],
        attemptsAfterSequence: 0,
        attemptsError: null,
        attemptsLoading: false,
        attemptsNextAfterSequence: null,
        selectedDeviceExecutionId: deviceExecutionId,
        selectedAttemptId: null,
      };
    });
  }, []);

  const selectAttempt = useCallback((attemptId: string) => {
    setState((current) =>
      current.attempts.some((attempt) => attempt.id === attemptId)
        ? { ...current, selectedAttemptId: attemptId }
        : current,
    );
  }, []);

  const nextAttemptsPage = useCallback(() => {
    setState((current) => {
      const next = current.attemptsNextAfterSequence;
      if (next === null || current.attemptsLoading) return current;
      attemptPageStackRef.current = [...attemptPageStackRef.current, next];
      return {
        ...current,
        attempts: [],
        attemptsAfterSequence: next,
        attemptsError: null,
        attemptsNextAfterSequence: null,
        selectedAttemptId: null,
      };
    });
  }, []);

  const previousAttemptsPage = useCallback(() => {
    setState((current) => {
      if (attemptPageStackRef.current.length <= 1 || current.attemptsLoading) return current;
      attemptPageStackRef.current = attemptPageStackRef.current.slice(0, -1);
      return {
        ...current,
        attempts: [],
        attemptsAfterSequence: attemptPageStackRef.current.at(-1) ?? 0,
        attemptsError: null,
        attemptsNextAfterSequence: null,
        selectedAttemptId: null,
      };
    });
  }, []);

  const refreshAttempts = useCallback(() => {
    setState((current) => ({ ...current, attemptsRevision: current.attemptsRevision + 1 }));
  }, []);

  const submitControl = useCallback(
    async (action: RuntimeRunAction) => {
      const host = window.studioHost;
      const runGroupId = state.snapshot?.runGroup.id;
      if (!host || !runGroupId || typeof host.runtime.submitRunAction !== 'function') return;
      try {
        const result = await host.runtime.submitRunAction({ runGroupId, action });
        if (!result.ok) {
          setState((current) => ({ ...current, observationError: result.error.message }));
          return;
        }
        setState((current) => {
          if (current.snapshot?.runGroup.id !== runGroupId) return current;
          if (
            current.controlState &&
            result.value.controlState.submissionVersion < current.controlState.submissionVersion
          ) {
            return current;
          }
          const snapshot = newestSnapshot(current.snapshot, result.value.snapshot);
          const finished = terminal(snapshot);
          if (finished && !unresolvedControl(result.value.controlState)) {
            intentLockRef.current = false;
          }
          return {
            ...current,
            controlState: result.value.controlState,
            observationError: result.value.controlState.lastError?.message ?? null,
            phase: finished ? 'terminal' : 'running',
            snapshot,
          };
        });
      } catch {
        setState((current) => ({
          ...current,
          observationError: 'The Runtime control bridge failed unexpectedly.',
        }));
      }
    },
    [state.snapshot?.runGroup.id],
  );

  const checkControl = useCallback(async () => {
    const host = window.studioHost;
    const runGroupId = state.snapshot?.runGroup.id;
    if (!host || !runGroupId || typeof host.runtime.checkRunControl !== 'function') return;
    try {
      const result = await host.runtime.checkRunControl({ runGroupId });
      if (!result.ok) {
        setState((current) => ({ ...current, observationError: result.error.message }));
        return;
      }
      setState((current) =>
        current.snapshot?.runGroup.id === runGroupId &&
        (!current.controlState ||
          result.value.controlState.submissionVersion >= current.controlState.submissionVersion)
          ? {
              ...current,
              controlState: result.value.controlState,
              observationError: result.value.controlState.lastError?.message ?? null,
              snapshot: newestSnapshot(current.snapshot, result.value.snapshot),
            }
          : current,
      );
    } catch {
      setState((current) => ({
        ...current,
        observationError: 'Unable to check the Runtime control outcome.',
      }));
    }
  }, [state.snapshot?.runGroup.id]);

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
  const unresolved =
    [
      'recovering',
      'recovery-failed',
      'preparing',
      'compiling',
      'starting',
      'running',
      'uncertain',
      'lost',
    ].includes(state.phase) || unresolvedControl(state.controlState);
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
    checkControl,
    nextAttemptsPage,
    pendingNodeConfigurationId,
    previousAttemptsPage,
    recover,
    refreshAttempts,
    retryAdmission,
    runButtonLabel,
    runtimeStopped,
    selectAttempt,
    selectDeviceExecution,
    start,
    state,
    submitControl,
    unresolved,
  };
}
