import type {
  LocalDraftArtifacts,
  LocalProjectSnapshot,
} from '@application/project/local-project-repository';
import type {
  CloudProject,
  CloudProjectDraft,
  CloudProjectDraftPayload,
  JsonObject,
} from '@application/project/project-cloud';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import type { ProjectDocument } from '@domain/project/project';
import { projectDocumentSchema } from '@domain/project/project-schema';
import { decodeWorkflowDocument } from '@domain/project/workflow-persistence';
import type { JsonValue } from '@shared/types/json-value';
import { toRuntimeEditorGraph } from '@application/runtime/to-runtime-editor-graph';

const CLOUD_EDITOR_GRAPH_SCHEMA_VERSION = 1;

export class CloudProjectDocumentError extends Error {
  readonly reason: 'invalid' | 'unsupported';

  constructor(reason: 'invalid' | 'unsupported', message: string, options?: ErrorOptions) {
    super(message, options);
    this.reason = reason;
    this.name = 'CloudProjectDocumentError';
  }
}

export interface DecodedCloudProject {
  artifacts: LocalDraftArtifacts;
  document: ProjectDocument;
}

function jsonObject(value: JsonValue, label: string): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new CloudProjectDocumentError('invalid', `${label} must be a JSON object.`);
  }
  return value;
}

function copyAsJsonObject(value: unknown, label: string): JsonObject {
  try {
    return jsonObject(JSON.parse(JSON.stringify(value)) as JsonValue, label);
  } catch (error) {
    if (error instanceof CloudProjectDocumentError) throw error;
    throw new CloudProjectDocumentError('invalid', `${label} is not valid JSON.`, { cause: error });
  }
}

export function createCloudDraftPayload(
  snapshot: LocalProjectSnapshot,
  expectedVersion = 0,
): CloudProjectDraftPayload {
  const { document, draftState } = snapshot;
  const { manifest } = document;
  const workflow = document.workflows[manifest.entryWorkflow];
  if (!workflow) {
    throw new CloudProjectDocumentError(
      'invalid',
      `Entry workflow ${manifest.entryWorkflow} is missing.`,
    );
  }
  const runtimeCacheIsFresh =
    draftState.runtimeIrSourceRevision === draftState.sourceRevision &&
    draftState.runtimeIrWorkflowPath === manifest.entryWorkflow;
  const validationCacheIsFresh = draftState.validationSourceRevision === draftState.sourceRevision;
  return {
    expectedVersion,
    editorGraph: copyAsJsonObject(toRuntimeEditorGraph(workflow), 'editorGraph'),
    inputSchema: jsonObject(draftState.inputSchema, 'inputSchema'),
    runtimeIr:
      runtimeCacheIsFresh && draftState.runtimeIr !== null
        ? jsonObject(draftState.runtimeIr, 'runtimeIr')
        : null,
    validationSummary: validationCacheIsFresh
      ? jsonObject(draftState.validationSummary, 'validationSummary')
      : {},
  };
}

export function decodeCloudProject(
  project: CloudProject,
  draft: CloudProjectDraft | null,
  localId: string,
): DecodedCloudProject {
  if (!draft) {
    return {
      document: createEmptyProjectDocument(localId, project.name, project.description ?? undefined),
      artifacts: emptyArtifacts(),
    };
  }

  const graph = draft.editorGraph as Record<string, JsonValue>;
  if (graph.schemaVersion !== CLOUD_EDITOR_GRAPH_SCHEMA_VERSION) {
    throw new CloudProjectDocumentError(
      'unsupported',
      `Cloud draft schema ${String(graph.schemaVersion)} is not supported by this Studio version.`,
    );
  }
  const legacyBundle = graph.workflows !== undefined;
  const emptyDocument = createEmptyProjectDocument(
    localId,
    project.name,
    project.description ?? undefined,
  );
  const workflows = legacyBundle
    ? jsonObject(graph.workflows!, 'editorGraph.workflows')
    : { [emptyDocument.manifest.entryWorkflow]: graph };
  const workflowPaths = Object.keys(workflows);
  const manifestExtension = legacyBundle
    ? decodeManifestExtension(graph.manifest, workflowPaths)
    : {
        version: emptyDocument.manifest.version,
        minimumRuntimeVersion: emptyDocument.manifest.minimumRuntimeVersion,
        workflows: workflowPaths,
        assets: emptyDocument.manifest.assets,
        permissions: emptyDocument.manifest.permissions,
        environment: emptyDocument.manifest.environment,
      };
  const entryWorkflow =
    legacyBundle && typeof graph.entryWorkflow === 'string'
      ? graph.entryWorkflow
      : emptyDocument.manifest.entryWorkflow;

  try {
    const decodedWorkflows = Object.fromEntries(
      Object.entries(workflows).map(([path, workflow]) => [path, decodeWorkflowDocument(workflow)]),
    );
    const document = projectDocumentSchema.parse({
      manifest: {
        schemaVersion: CLOUD_EDITOR_GRAPH_SCHEMA_VERSION,
        projectId: localId,
        name: project.name,
        ...(project.description ? { description: project.description } : {}),
        entryWorkflow,
        ...manifestExtension,
      },
      workflows: decodedWorkflows,
    });
    return {
      document,
      artifacts: {
        inputSchema: draft.inputSchema,
        runtimeIr: draft.runtimeIr,
        validationSummary: draft.validationSummary,
      },
    };
  } catch (error) {
    throw new CloudProjectDocumentError('invalid', 'Cloud draft contains an invalid project.', {
      cause: error,
    });
  }
}

function decodeManifestExtension(value: JsonValue | undefined, workflowPaths: string[]) {
  if (value === undefined) {
    return {
      version: '0.1.0',
      minimumRuntimeVersion: '0.1.0',
      workflows: workflowPaths,
      assets: [],
      permissions: [],
      environment: [],
    };
  }
  const manifest = jsonObject(value, 'editorGraph.manifest') as Record<string, JsonValue>;
  return {
    version: manifest.version,
    minimumRuntimeVersion: manifest.minimumRuntimeVersion,
    workflows: manifest.workflowPaths,
    assets: manifest.assets,
    permissions: manifest.permissions,
    environment: manifest.environment,
  };
}

function emptyArtifacts(): LocalDraftArtifacts {
  return {
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    runtimeIr: null,
    validationSummary: {},
  };
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`;
}

export function draftMatchesPayload(draft: CloudProjectDraft, payload: CloudProjectDraftPayload) {
  return (
    canonicalJson(draft.editorGraph) === canonicalJson(payload.editorGraph) &&
    canonicalJson(draft.inputSchema) === canonicalJson(payload.inputSchema) &&
    canonicalJson(draft.runtimeIr) === canonicalJson(payload.runtimeIr) &&
    canonicalJson(draft.validationSummary) === canonicalJson(payload.validationSummary)
  );
}
