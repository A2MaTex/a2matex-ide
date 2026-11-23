import { RuntimeError } from '@application/runtime/runtime.error';
import type {
  RuntimeCompilationInput,
  RuntimeOperations,
} from '@application/runtime/runtime.types';
import type { JsonValue } from '@shared/types/json-value';
import { RuntimeProcessManager } from '@electron/main/runtime/process/runtime-process-manager';

function graphNodeTypes(editorGraph: Record<string, JsonValue>) {
  if (!Array.isArray(editorGraph.nodes)) return [];
  return editorGraph.nodes.flatMap((node) => {
    if (!node || Array.isArray(node) || typeof node !== 'object') return [];
    return typeof node.type === 'string' ? [node.type] : [];
  });
}

function assertSupportedNodes(editorGraph: Record<string, JsonValue>, supportedTypes: Set<string>) {
  const unsupported = [
    ...new Set(graphNodeTypes(editorGraph).filter((type) => !supportedTypes.has(type))),
  ];
  if (unsupported.length > 0) {
    throw new RuntimeError(
      'RUNTIME_INCOMPATIBLE',
      `The local Runtime does not support: ${unsupported.join(', ')}.`,
      false,
    );
  }
}

export function createRuntimeServices(manager: RuntimeProcessManager): RuntimeOperations {
  return {
    activeRun: () => manager.withReadyRuntime((client) => client.activeRun()),
    getStatus: () => manager.getStatus(),
    onStatusChanged: (listener) => manager.onStatusChanged(listener),
    shutdown: () => manager.shutdown(),
    validate: (editorGraph) =>
      manager.withReadyRuntime((client, info) => {
        assertSupportedNodes(editorGraph, new Set(info.supportedNodes.map((node) => node.type)));
        return client.validate(editorGraph);
      }),
    compile: (input: RuntimeCompilationInput) =>
      manager.withReadyRuntime((client, info) => {
        assertSupportedNodes(
          input.editorGraph,
          new Set(info.supportedNodes.map((node) => node.type)),
        );
        return client.compile({ editorGraph: input.editorGraph, inputSchema: input.inputSchema });
      }),
    listDevices: () => manager.withReadyRuntime((client) => client.listDevices(false)),
    nodeAttempts: (deviceExecutionId, afterSequence, limit) =>
      manager.withReadyRuntime((client) =>
        client.nodeAttempts(deviceExecutionId, afterSequence, limit),
      ),
    refreshDevices: () => manager.withReadyRuntime((client) => client.listDevices(true)),
    runById: (runGroupId) => manager.withReadyRuntime((client) => client.runById(runGroupId)),
    startRun: (input) => manager.withReadyRuntime((client) => client.startRun(input)),
  };
}
