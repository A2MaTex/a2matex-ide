import type { ProjectDocument } from '@domain/project/project';
import type { JsonValue } from '@shared/types/json-value';

export type LocalProjectSyncStatus =
  | 'conflict'
  | 'error'
  | 'local-ahead'
  | 'local-only'
  | 'name-conflict'
  | 'offline'
  | 'remote-ahead'
  | 'synced'
  | 'syncing';

export interface LocalDraftArtifacts {
  inputSchema: JsonValue;
  runtimeIr: JsonValue | null;
  testSummary: JsonValue;
  validationSummary: JsonValue;
}

export interface LocalProjectDraftState extends LocalDraftArtifacts {
  baseRemoteVersion: number | null;
  contentHash: string | null;
  lastSyncedLocalRevision: number | null;
  localRevision: number;
  metadataRevision: number;
  metadataSyncedRevision: number | null;
  observedRemoteVersion: number | null;
  remoteSavedAt: string | null;
  syncStatus: LocalProjectSyncStatus;
}

export interface LocalProjectSnapshot {
  accountScope: string;
  createdAt: string;
  document: ProjectDocument;
  draftState: LocalProjectDraftState;
  localId: string;
  remoteProjectId: string | null;
  updatedAt: string;
}

export interface CreateLocalProjectInput {
  accountScope: string;
  document: ProjectDocument;
  localId: string;
}

export interface SaveLocalProjectInput {
  accountScope: string;
  artifacts?: LocalDraftArtifacts;
  document: ProjectDocument;
  expectedLocalRevision: number;
  localId: string;
}

export interface LocalProjectRepository {
  create(input: CreateLocalProjectInput): Promise<LocalProjectSnapshot>;
  findById(accountScope: string, localId: string): Promise<LocalProjectSnapshot | null>;
  list(accountScope: string): Promise<LocalProjectSnapshot[]>;
  save(input: SaveLocalProjectInput): Promise<LocalProjectSnapshot>;
}

export type LocalProjectPersistenceErrorCode =
  | 'CORRUPTED_LOCAL_DATA'
  | 'DATABASE_MIGRATION_FAILED'
  | 'DUPLICATE_PROJECT_NAME'
  | 'LOCAL_REVISION_CONFLICT'
  | 'PROJECT_NOT_FOUND'
  | 'TRANSACTION_FAILED';

export class LocalProjectPersistenceError extends Error {
  readonly code: LocalProjectPersistenceErrorCode;
  readonly retryable: boolean;

  constructor(
    code: LocalProjectPersistenceErrorCode,
    message: string,
    retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.retryable = retryable;
    this.name = 'LocalProjectPersistenceError';
  }
}

export interface CachedCloudProject {
  accountScope: string;
  description: string | null;
  name: string;
  normalizedName: string;
  payload: JsonValue;
  remoteProjectId: string;
  remoteUpdatedAt: string;
  status: string;
}

export interface CloudProjectCacheRefresh {
  accountScope: string;
  completed: boolean;
  nextCursor: string | null;
  refreshedAt: string;
}

export interface CloudProjectCacheRepository {
  list(accountScope: string): Promise<CachedCloudProject[]>;
  replace(
    accountScope: string,
    projects: readonly Omit<CachedCloudProject, 'accountScope'>[],
    refresh: Omit<CloudProjectCacheRefresh, 'accountScope'>,
  ): Promise<void>;
  state(accountScope: string): Promise<CloudProjectCacheRefresh | null>;
}
