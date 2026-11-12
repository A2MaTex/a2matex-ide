import type {
  LocalProjectDraftState,
  LocalProjectSnapshot,
} from '@application/project/local-project-repository';
import {
  ProjectRepositoryError,
  type CreateProjectInput,
  type ExportProjectInput,
  type ProjectRepository,
  type SaveProjectInput,
} from '@application/project/project-repository';
import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { normalizeProjectName } from '@domain/project/project-name';
import { projectDocumentSchema } from '@domain/project/project-schema';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function initialDraftState(): LocalProjectDraftState {
  return {
    baseRemoteDescription: null,
    baseRemoteName: null,
    baseRemoteVersion: null,
    contentHash: null,
    inputSchema: {},
    lastSyncedLocalRevision: null,
    localRevision: 0,
    metadataRevision: 0,
    metadataSyncedRevision: null,
    observedRemoteVersion: null,
    remoteSavedAt: null,
    remoteCreatePending: false,
    runtimeIr: null,
    syncStatus: 'local-only',
    validationSummary: {},
  };
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, LocalProjectSnapshot>();

  async create(input: CreateProjectInput) {
    const normalizedName = normalizeProjectName(input.name);
    if (
      [...this.projects.values()].some(
        (project) => normalizeProjectName(project.document.manifest.name) === normalizedName,
      )
    ) {
      throw new ProjectRepositoryError(
        'DUPLICATE_PROJECT_NAME',
        'A local project with this name already exists.',
      );
    }
    const localId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const snapshot: LocalProjectSnapshot = {
      accountScope: 'memory',
      createdAt: timestamp,
      document: createEmptyProjectDocument(localId, input.name, input.description),
      draftState: initialDraftState(),
      localId,
      remoteProjectId: null,
      updatedAt: timestamp,
    };
    this.projects.set(localId, clone(snapshot));
    return clone(snapshot);
  }

  async list() {
    return [...this.projects.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  async open(localId: string) {
    const snapshot = this.projects.get(localId);
    if (!snapshot) throw new ProjectRepositoryError('PROJECT_NOT_FOUND', 'Project not found.');
    return clone(snapshot);
  }

  async save(input: SaveProjectInput) {
    const current = this.projects.get(input.localId);
    if (!current) throw new ProjectRepositoryError('PROJECT_NOT_FOUND', 'Project not found.');
    if (current.draftState.localRevision !== input.expectedLocalRevision) {
      throw new ProjectRepositoryError(
        'LOCAL_REVISION_CONFLICT',
        'The local project changed before it could be saved.',
        true,
      );
    }
    const document = projectDocumentSchema.parse(input.document);
    const metadataChanged =
      JSON.stringify(current.document.manifest) !== JSON.stringify(document.manifest);
    const workflowsChanged =
      JSON.stringify(current.document.workflows) !== JSON.stringify(document.workflows);
    if (!metadataChanged && !workflowsChanged) return clone(current);
    const snapshot: LocalProjectSnapshot = {
      ...current,
      document,
      draftState: {
        ...current.draftState,
        localRevision: current.draftState.localRevision + 1,
        metadataRevision: current.draftState.metadataRevision + (metadataChanged ? 1 : 0),
        ...(workflowsChanged ? { runtimeIr: null, validationSummary: {} } : {}),
      },
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(input.localId, clone(snapshot));
    return clone(snapshot);
  }

  async importProject() {
    return null;
  }

  async exportProject(_input: ExportProjectInput) {
    void _input;
    return { displayPath: 'Memory export', savedAt: new Date().toISOString() };
  }
}
