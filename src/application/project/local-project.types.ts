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
  validationSummary: JsonValue;
}

export interface LocalProjectDraftState extends LocalDraftArtifacts {
  baseRemoteDescription: string | null;
  baseRemoteName: string | null;
  baseRemoteVersion: number | null;
  contentHash: string | null;
  lastSyncedLocalRevision: number | null;
  localRevision: number;
  metadataRevision: number;
  metadataSyncedRevision: number | null;
  observedRemoteVersion: number | null;
  remoteSavedAt: string | null;
  remoteCreatePending: boolean;
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

export interface AcknowledgeRemoteDraftInput {
  accountScope: string;
  contentHash: string;
  localId: string;
  remoteSavedAt: string;
  remoteVersion: number;
  syncedLocalRevision: number;
}

export interface AcknowledgeRemoteMetadataInput {
  accountScope: string;
  description: string | null;
  localId: string;
  name: string;
  revision: number;
}

export interface ApplyCloudProjectInput {
  accountScope: string;
  artifacts: LocalDraftArtifacts;
  baseRemoteDescription: string | null;
  baseRemoteName: string;
  contentHash: string | null;
  document: ProjectDocument;
  localId: string;
  remoteProjectId: string;
  remoteSavedAt: string | null;
  remoteVersion: number | null;
}

export interface ReplaceLocalFromCloudInput extends ApplyCloudProjectInput {
  expectedLocalRevision: number;
}

export interface LocalProjectRepository {
  acknowledgeMetadata(input: AcknowledgeRemoteMetadataInput): Promise<LocalProjectSnapshot>;
  acknowledgeRemoteDraft(input: AcknowledgeRemoteDraftInput): Promise<LocalProjectSnapshot>;
  beginRemoteCreate(accountScope: string, localId: string): Promise<LocalProjectSnapshot>;
  bindRemoteProject(
    accountScope: string,
    localId: string,
    remoteProjectId: string,
  ): Promise<LocalProjectSnapshot>;
  create(input: CreateLocalProjectInput): Promise<LocalProjectSnapshot>;
  completeSyncCheck(
    accountScope: string,
    localId: string,
    observedRemoteVersion: number,
  ): Promise<LocalProjectSnapshot>;
  findById(accountScope: string, localId: string): Promise<LocalProjectSnapshot | null>;
  findByRemoteId(
    accountScope: string,
    remoteProjectId: string,
  ): Promise<LocalProjectSnapshot | null>;
  list(accountScope: string): Promise<LocalProjectSnapshot[]>;
  materializeCloudProject(input: ApplyCloudProjectInput): Promise<LocalProjectSnapshot>;
  save(input: SaveLocalProjectInput): Promise<LocalProjectSnapshot>;
  replaceFromCloud(input: ReplaceLocalFromCloudInput): Promise<LocalProjectSnapshot>;
  observeRemote(
    accountScope: string,
    localId: string,
    observedRemoteVersion: number | null,
    status: Extract<LocalProjectSyncStatus, 'conflict' | 'remote-ahead'>,
  ): Promise<LocalProjectSnapshot>;
  setSyncStatus(
    accountScope: string,
    localId: string,
    status: LocalProjectSyncStatus,
  ): Promise<LocalProjectSnapshot>;
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
