import type { MainAuthSession } from '@application/auth/auth-session';
import type {
  CloudProjectCacheRepository,
  LocalProjectRepository,
  LocalProjectSnapshot,
  LocalProjectSyncStatus,
} from '@application/project/local-project-repository';
import { LocalProjectPersistenceError } from '@application/project/local-project-repository';
import {
  CloudProjectDocumentError,
  createCloudDraftPayload,
  decodeCloudProject,
  draftMatchesPayload,
} from '@application/project/cloud-project-document';
import { normalizeCloudProjectName } from '@domain/project/project-name';
import type { JsonValue } from '@shared/types/json-value';

export type JsonObject = { [key: string]: JsonValue };
export type CloudProjectStatus = 'ACTIVE' | 'ARCHIVED';

export interface CloudProject {
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  publisherAccountId: string;
  status: CloudProjectStatus;
  updatedAt: string | null;
}

export interface CloudProjectPage {
  items: CloudProject[];
  limit: number;
  page: number;
  totalItems: number;
  totalPages: number;
}

export interface CloudProjectDraft {
  contentHash: string;
  editorGraph: JsonObject;
  id: string;
  inputSchema: JsonObject;
  projectId: string;
  runtimeIr: JsonObject | null;
  savedAt: string;
  testSummary: JsonObject;
  validationSummary: JsonObject;
  version: number;
}

export interface CloudProjectDraftPayload {
  editorGraph: JsonObject;
  expectedVersion: number;
  inputSchema: JsonObject;
  runtimeIr: JsonObject | null;
  testSummary: JsonObject;
  validationSummary: JsonObject;
}

export interface CloudDraftAcknowledgement {
  contentHash: string;
  id: string;
  savedAt: string;
  version: number;
}

export interface UpdateCloudProjectInput {
  description?: string | null;
  name?: string;
}

export interface CloudProjectGateway {
  archive(accessToken: string, projectId: string): Promise<void>;
  create(
    accessToken: string,
    input: { description: string | null; name: string },
  ): Promise<{ id: string }>;
  get(accessToken: string, projectId: string): Promise<CloudProject>;
  getDraft(
    accessToken: string,
    projectId: string,
  ): Promise<{ draft: CloudProjectDraft | null; projectStatus: CloudProjectStatus }>;
  list(
    accessToken: string,
    input: { limit: number; page: number; status?: CloudProjectStatus },
  ): Promise<CloudProjectPage>;
  putDraft(
    accessToken: string,
    projectId: string,
    input: CloudProjectDraftPayload,
  ): Promise<CloudDraftAcknowledgement>;
  update(accessToken: string, projectId: string, input: UpdateCloudProjectInput): Promise<void>;
}

export type CloudProjectErrorCode =
  | 'CLOUD_CONFIGURATION_ERROR'
  | 'CLOUD_DRAFT_UNSUPPORTED'
  | 'CLOUD_DRAFT_VERSION_CONFLICT'
  | 'CLOUD_FORBIDDEN'
  | 'CLOUD_INVALID_INPUT'
  | 'CLOUD_INVALID_RESPONSE'
  | 'CLOUD_LOCAL_CHANGES'
  | 'CLOUD_NAME_CONFLICT'
  | 'CLOUD_NETWORK_UNAVAILABLE'
  | 'CLOUD_PROJECT_ARCHIVED'
  | 'CLOUD_PROJECT_NOT_FOUND'
  | 'CLOUD_PUBLISHER_BLOCKED'
  | 'CLOUD_PUBLISHER_UNAVAILABLE'
  | 'CLOUD_SERVER_ERROR'
  | 'CLOUD_SESSION_EXPIRED'
  | 'CLOUD_TIMEOUT';

export class CloudProjectError extends Error {
  readonly code: CloudProjectErrorCode;
  readonly retryable: boolean;
  readonly details?: { currentVersion?: number };

  constructor(
    code: CloudProjectErrorCode,
    message: string,
    retryable: boolean,
    details?: { currentVersion?: number },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    this.name = 'CloudProjectError';
  }
}

export interface CloudProjectIndex {
  projects: CloudProject[];
  refreshedAt: string | null;
  source: 'cache' | 'network';
  warning: string | null;
}

export interface ProjectCloudClient {
  archive(projectId: string): Promise<CloudProject>;
  getDetail(projectId: string): Promise<CloudProject>;
  load(): Promise<CloudProjectIndex>;
  open(projectId: string): Promise<LocalProjectSnapshot>;
  refresh(): Promise<CloudProjectIndex>;
  sync(localId: string): Promise<LocalProjectSnapshot>;
  updateFromCloud(localId: string): Promise<LocalProjectSnapshot>;
  update(
    projectId: string,
    input: UpdateCloudProjectInput,
    localId?: string,
  ): Promise<CloudProject>;
}

interface ProjectCloudServiceOptions {
  createId?: () => string;
  now?: () => string;
  onEvent?: (event: ProjectCloudEvent) => void;
  pageSize?: number;
}

export { createCloudDraftPayload } from '@application/project/cloud-project-document';

export interface ProjectCloudEvent {
  attemptId?: string;
  errorCode?: CloudProjectErrorCode;
  event: 'cloud_open' | 'cloud_update' | 'sync_completed' | 'sync_failed' | 'sync_started';
  localId?: string;
  localRevision?: number;
  remoteProjectId?: string;
  remoteVersion?: number;
  status?: LocalProjectSyncStatus;
}

function cloudProjectFromCache(payload: JsonValue): CloudProject | null {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return null;
  const candidate = payload as Record<string, JsonValue>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.publisherAccountId !== 'string' ||
    typeof candidate.name !== 'string' ||
    (candidate.description !== null && typeof candidate.description !== 'string') ||
    (candidate.status !== 'ACTIVE' && candidate.status !== 'ARCHIVED') ||
    typeof candidate.createdAt !== 'string' ||
    (candidate.updatedAt !== null && typeof candidate.updatedAt !== 'string')
  ) {
    return null;
  }
  return candidate as unknown as CloudProject;
}

function requireProjectId(value: string) {
  const projectId = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
  ) {
    throw new CloudProjectError('CLOUD_INVALID_INPUT', 'A valid project ID is required.', false);
  }
  return projectId;
}

function metadataOf(snapshot: LocalProjectSnapshot) {
  return {
    name: snapshot.document.manifest.name,
    description: snapshot.document.manifest.description?.trim() || null,
  };
}

function metadataEqual(
  project: CloudProject,
  metadata: { description: string | null; name: string },
) {
  return project.name === metadata.name && project.description === metadata.description;
}

export class ProjectCloudService implements ProjectCloudClient {
  private readonly gateway: CloudProjectGateway;
  private readonly cache: CloudProjectCacheRepository;
  private readonly projects: LocalProjectRepository;
  private readonly auth: MainAuthSession;
  private readonly accountScope: () => Promise<string>;
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly onEvent?: (event: ProjectCloudEvent) => void;
  private readonly pageSize: number;
  private readonly syncs = new Map<string, Promise<LocalProjectSnapshot>>();
  private readonly refreshes = new Map<string, Promise<CloudProjectIndex>>();

  constructor(
    gateway: CloudProjectGateway,
    cache: CloudProjectCacheRepository,
    projects: LocalProjectRepository,
    auth: MainAuthSession,
    accountScope: () => Promise<string>,
    options: ProjectCloudServiceOptions = {},
  ) {
    this.gateway = gateway;
    this.cache = cache;
    this.projects = projects;
    this.auth = auth;
    this.accountScope = accountScope;
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = options.now ?? (() => new Date().toISOString());
    this.onEvent = options.onEvent;
    this.pageSize = options.pageSize ?? 100;
  }

  async load(): Promise<CloudProjectIndex> {
    const scope = await this.accountScope();
    const [cached, state] = await Promise.all([this.cache.list(scope), this.cache.state(scope)]);
    return {
      projects: cached.map((item) => cloudProjectFromCache(item.payload)).filter(Boolean),
      refreshedAt: state?.refreshedAt ?? null,
      source: 'cache',
      warning: null,
    } as CloudProjectIndex;
  }

  async refresh(): Promise<CloudProjectIndex> {
    try {
      return await this.refreshStrict();
    } catch (error) {
      const cached = await this.load();
      if (cached.projects.length === 0) throw error;
      return { ...cached, warning: messageOf(error) };
    }
  }

  async getDetail(projectId: string) {
    return this.withToken((token) => this.gateway.get(token, requireProjectId(projectId)));
  }

  async open(projectId: string): Promise<LocalProjectSnapshot> {
    const remoteProjectId = requireProjectId(projectId);
    const scope = await this.accountScope();
    const existing = await this.projects.findByRemoteId(scope, remoteProjectId);
    if (existing) return existing;

    const [project, remoteState] = await this.withToken((token) =>
      Promise.all([
        this.gateway.get(token, remoteProjectId),
        this.gateway.getDraft(token, remoteProjectId),
      ]),
    );
    const localId = this.createId();
    const decoded = decodeCloudProjectSafely(project, remoteState.draft, localId);
    const snapshot = await this.projects.materializeCloudProject({
      accountScope: scope,
      localId,
      remoteProjectId,
      document: decoded.document,
      artifacts: decoded.artifacts,
      baseRemoteName: project.name,
      baseRemoteDescription: project.description,
      remoteVersion: remoteState.draft?.version ?? null,
      contentHash: remoteState.draft?.contentHash ?? null,
      remoteSavedAt: remoteState.draft?.savedAt ?? null,
    });
    this.emit({
      event: 'cloud_open',
      localId: snapshot.localId,
      localRevision: snapshot.draftState.localRevision,
      remoteProjectId,
      ...(remoteState.draft ? { remoteVersion: remoteState.draft.version } : {}),
      status: snapshot.draftState.syncStatus,
    });
    return snapshot;
  }

  async updateFromCloud(localId: string): Promise<LocalProjectSnapshot> {
    const id = localId.trim();
    if (!id) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project ID is required.', false);
    }
    const scope = await this.accountScope();
    const current = await this.projects.findById(scope, id);
    if (!current?.remoteProjectId) {
      throw new CloudProjectError(
        'CLOUD_INVALID_INPUT',
        'The local project is not bound to a cloud project.',
        false,
      );
    }
    const clean =
      current.draftState.localRevision === current.draftState.lastSyncedLocalRevision &&
      current.draftState.metadataRevision === current.draftState.metadataSyncedRevision;
    if (!clean || current.draftState.syncStatus !== 'remote-ahead') {
      throw new CloudProjectError(
        'CLOUD_LOCAL_CHANGES',
        'Update from cloud is only available for a clean local project that is remote-ahead.',
        false,
      );
    }

    const remoteProjectId = current.remoteProjectId;
    const [project, remoteState] = await this.withToken((token) =>
      Promise.all([
        this.gateway.get(token, remoteProjectId),
        this.gateway.getDraft(token, remoteProjectId),
      ]),
    );
    if (!remoteState.draft) {
      throw new CloudProjectError(
        'CLOUD_INVALID_RESPONSE',
        'The cloud draft no longer exists; the local project was not changed.',
        false,
      );
    }
    const decoded = decodeCloudProjectSafely(project, remoteState.draft, id);
    try {
      const snapshot = await this.projects.replaceFromCloud({
        accountScope: scope,
        localId: id,
        remoteProjectId,
        expectedLocalRevision: current.draftState.localRevision,
        document: decoded.document,
        artifacts: decoded.artifacts,
        baseRemoteName: project.name,
        baseRemoteDescription: project.description,
        remoteVersion: remoteState.draft.version,
        contentHash: remoteState.draft.contentHash,
        remoteSavedAt: remoteState.draft.savedAt,
      });
      this.emit({
        event: 'cloud_update',
        localId: id,
        localRevision: snapshot.draftState.localRevision,
        remoteProjectId,
        remoteVersion: remoteState.draft.version,
        status: snapshot.draftState.syncStatus,
      });
      return snapshot;
    } catch (error) {
      if (
        error instanceof LocalProjectPersistenceError &&
        error.code === 'LOCAL_REVISION_CONFLICT'
      ) {
        throw new CloudProjectError(
          'CLOUD_LOCAL_CHANGES',
          'Local changes were saved while the cloud draft was loading; nothing was replaced.',
          false,
          undefined,
          { cause: error },
        );
      }
      throw error;
    }
  }

  async update(projectId: string, input: UpdateCloudProjectInput, localId?: string) {
    const id = requireProjectId(projectId);
    if (input.name === undefined && input.description === undefined) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Name or description is required.', false);
    }
    const name = input.name?.trim();
    const description = input.description?.trim() || null;
    if (name !== undefined && (!name || name.length > 255)) {
      throw new CloudProjectError(
        'CLOUD_INVALID_INPUT',
        'Project name must contain between 1 and 255 characters.',
        false,
      );
    }
    if (description && description.length > 4_000) {
      throw new CloudProjectError(
        'CLOUD_INVALID_INPUT',
        'Project description must not exceed 4,000 characters.',
        false,
      );
    }
    await this.withToken((token) =>
      this.gateway.update(token, id, {
        ...(name !== undefined ? { name } : {}),
        ...(input.description !== undefined ? { description } : {}),
      }),
    );
    const detail = await this.getDetail(id);
    if (localId) {
      const scope = await this.accountScope();
      const snapshot = await this.projects.findById(scope, localId);
      if (!snapshot || snapshot.remoteProjectId !== id) {
        throw new CloudProjectError(
          'CLOUD_INVALID_INPUT',
          'The local project binding does not match this cloud project.',
          false,
        );
      }
      await this.projects.acknowledgeMetadata({
        accountScope: scope,
        description: detail.description,
        localId,
        name: detail.name,
        revision: snapshot.draftState.metadataRevision,
      });
    }
    await this.refreshStrict();
    return detail;
  }

  async archive(projectId: string) {
    const id = requireProjectId(projectId);
    await this.withToken((token) => this.gateway.archive(token, id));
    const detail = await this.getDetail(id);
    await this.refreshStrict();
    return detail;
  }

  async sync(localId: string): Promise<LocalProjectSnapshot> {
    const id = localId.trim();
    if (!id) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project ID is required.', false);
    }
    const scope = await this.accountScope();
    const syncKey = `${scope}\u0000${id}`;
    const current = this.syncs.get(syncKey);
    if (current) return current;
    const attemptId = this.createId();
    this.emit({ event: 'sync_started', attemptId, localId: id });
    const sync = this.runSync(scope, id)
      .then((snapshot) => {
        this.emit({
          event: 'sync_completed',
          attemptId,
          localId: id,
          localRevision: snapshot.draftState.localRevision,
          ...(snapshot.remoteProjectId ? { remoteProjectId: snapshot.remoteProjectId } : {}),
          ...(snapshot.draftState.observedRemoteVersion === null
            ? {}
            : { remoteVersion: snapshot.draftState.observedRemoteVersion }),
          status: snapshot.draftState.syncStatus,
        });
        return snapshot;
      })
      .catch((error) => {
        this.emit({
          event: 'sync_failed',
          attemptId,
          localId: id,
          ...(error instanceof CloudProjectError ? { errorCode: error.code } : {}),
        });
        throw error;
      })
      .finally(() => this.syncs.delete(syncKey));
    this.syncs.set(syncKey, sync);
    return sync;
  }

  private async refreshStrict(): Promise<CloudProjectIndex> {
    const scope = await this.accountScope();
    const current = this.refreshes.get(scope);
    if (current) return current;
    const refresh = this.performRefresh(scope).finally(() => this.refreshes.delete(scope));
    this.refreshes.set(scope, refresh);
    return refresh;
  }

  private async performRefresh(scope: string): Promise<CloudProjectIndex> {
    const projects: CloudProject[] = [];
    let page = 1;
    while (true) {
      const result = await this.withToken((token) =>
        this.gateway.list(token, { page, limit: this.pageSize }),
      );
      projects.push(...result.items);
      if (page >= result.totalPages) break;
      page += 1;
    }

    const refreshedAt = this.now();
    await this.cache.replace(
      scope,
      projects.map((project) => ({
        description: project.description,
        name: project.name,
        normalizedName: normalizeCloudProjectName(project.name),
        payload: project as unknown as JsonValue,
        remoteProjectId: project.id,
        remoteUpdatedAt: project.updatedAt ?? project.createdAt,
        status: project.status,
      })),
      { completed: true, nextCursor: null, refreshedAt },
    );
    return { projects, refreshedAt, source: 'network', warning: null };
  }

  private async runSync(scope: string, localId: string): Promise<LocalProjectSnapshot> {
    const snapshot = await this.projects.findById(scope, localId);
    if (!snapshot) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project was not found.', false);
    }
    await this.projects.setSyncStatus(scope, localId, 'syncing');
    try {
      return snapshot.draftState.baseRemoteVersion === null
        ? await this.runFirstSync(scope, snapshot)
        : await this.runRepeatedSync(scope, snapshot);
    } catch (error) {
      if (error instanceof CloudProjectError && error.code === 'CLOUD_NAME_CONFLICT') throw error;
      if (error instanceof CloudProjectError && error.code === 'CLOUD_DRAFT_VERSION_CONFLICT') {
        await this.projects.observeRemote(
          scope,
          localId,
          error.details?.currentVersion ?? snapshot.draftState.observedRemoteVersion,
          'conflict',
        );
        throw error;
      }
      const status: LocalProjectSyncStatus =
        error instanceof CloudProjectError &&
        ['CLOUD_NETWORK_UNAVAILABLE', 'CLOUD_TIMEOUT'].includes(error.code)
          ? 'offline'
          : 'error';
      await this.projects.setSyncStatus(scope, localId, status);
      throw error;
    }
  }

  private async runFirstSync(scope: string, snapshot: LocalProjectSnapshot) {
    const index = await this.refreshStrict();
    let remoteProjectId = snapshot.remoteProjectId;
    if (!remoteProjectId) {
      const duplicate = index.projects.find(
        (project) =>
          normalizeCloudProjectName(project.name) ===
          normalizeCloudProjectName(snapshot.document.manifest.name),
      );
      if (duplicate && !snapshot.draftState.remoteCreatePending) {
        await this.projects.setSyncStatus(scope, snapshot.localId, 'name-conflict');
        throw new CloudProjectError(
          'CLOUD_NAME_CONFLICT',
          'A cloud project already uses this name. Rename the local project before syncing.',
          false,
        );
      }

      await this.projects.beginRemoteCreate(scope, snapshot.localId);
      const created = await this.withToken((token) =>
        this.gateway.create(token, metadataOf(snapshot)),
      );
      remoteProjectId = created.id;
      await this.projects.bindRemoteProject(scope, snapshot.localId, remoteProjectId);
    }

    await this.withToken((token) =>
      this.gateway.update(token, remoteProjectId, metadataOf(snapshot)),
    );
    await this.projects.acknowledgeMetadata({
      accountScope: scope,
      localId: snapshot.localId,
      revision: snapshot.draftState.metadataRevision,
      ...metadataOf(snapshot),
    });

    await this.withToken((token) => this.gateway.getDraft(token, remoteProjectId));
    const acknowledgement = await this.withToken((token) =>
      this.gateway.putDraft(token, remoteProjectId, createCloudDraftPayload(snapshot)),
    );
    return this.projects.acknowledgeRemoteDraft({
      accountScope: scope,
      contentHash: acknowledgement.contentHash,
      localId: snapshot.localId,
      remoteSavedAt: acknowledgement.savedAt,
      remoteVersion: acknowledgement.version,
      syncedLocalRevision: snapshot.draftState.localRevision,
    });
  }

  private async runRepeatedSync(scope: string, snapshot: LocalProjectSnapshot) {
    const remoteProjectId = snapshot.remoteProjectId;
    if (!remoteProjectId || !snapshot.draftState.contentHash) {
      throw new CloudProjectError(
        'CLOUD_INVALID_INPUT',
        'The local cloud baseline is incomplete.',
        false,
      );
    }

    const remoteProject = await this.withToken((token) => this.gateway.get(token, remoteProjectId));
    if (remoteProject.status === 'ARCHIVED') {
      throw new CloudProjectError(
        'CLOUD_PROJECT_ARCHIVED',
        'The cloud project is archived.',
        false,
      );
    }
    const remoteState = await this.withToken((token) =>
      this.gateway.getDraft(token, remoteProjectId),
    );
    if (remoteState.projectStatus === 'ARCHIVED') {
      throw new CloudProjectError(
        'CLOUD_PROJECT_ARCHIVED',
        'The cloud project is archived.',
        false,
      );
    }

    const remoteDraft = remoteState.draft;
    const remoteVersion = remoteDraft?.version ?? null;
    const metadata = metadataOf(snapshot);
    const metadataLocalAhead =
      snapshot.draftState.metadataRevision !== snapshot.draftState.metadataSyncedRevision;
    const metadataMatchesLocal = metadataEqual(remoteProject, metadata);
    const metadataBaselineKnown = snapshot.draftState.baseRemoteName !== null;
    const metadataChanged =
      metadataBaselineKnown &&
      (remoteProject.name !== snapshot.draftState.baseRemoteName ||
        remoteProject.description !== snapshot.draftState.baseRemoteDescription);
    const metadataUnresolved = metadataBaselineKnown
      ? metadataChanged && !metadataMatchesLocal
      : !metadataMatchesLocal;

    const draftLocalAhead =
      snapshot.draftState.localRevision !== snapshot.draftState.lastSyncedLocalRevision;
    const draftChanged =
      !remoteDraft ||
      remoteDraft.version !== snapshot.draftState.baseRemoteVersion ||
      remoteDraft.contentHash !== snapshot.draftState.contentHash;
    const draftMatchesLocal =
      remoteDraft !== null &&
      draftMatchesPayload(remoteDraft, createCloudDraftPayload(snapshot, remoteDraft.version));
    const draftUnresolved = draftChanged && !draftMatchesLocal;

    if (metadataUnresolved || draftUnresolved) {
      const conflict =
        (metadataUnresolved && metadataLocalAhead) || (draftUnresolved && draftLocalAhead);
      return this.projects.observeRemote(
        scope,
        snapshot.localId,
        remoteVersion,
        conflict ? 'conflict' : 'remote-ahead',
      );
    }

    if (!metadataBaselineKnown || metadataChanged || metadataLocalAhead) {
      if (!metadataMatchesLocal) {
        await this.withToken((token) => this.gateway.update(token, remoteProjectId, metadata));
      }
      await this.projects.acknowledgeMetadata({
        accountScope: scope,
        localId: snapshot.localId,
        revision: snapshot.draftState.metadataRevision,
        ...metadata,
      });
    }

    if (draftChanged && draftMatchesLocal && remoteDraft) {
      return this.projects.acknowledgeRemoteDraft({
        accountScope: scope,
        contentHash: remoteDraft.contentHash,
        localId: snapshot.localId,
        remoteSavedAt: remoteDraft.savedAt,
        remoteVersion: remoteDraft.version,
        syncedLocalRevision: snapshot.draftState.localRevision,
      });
    }

    if (draftLocalAhead && remoteDraft) {
      const acknowledgement = await this.withToken((token) =>
        this.gateway.putDraft(
          token,
          remoteProjectId,
          createCloudDraftPayload(snapshot, remoteDraft.version),
        ),
      );
      if (
        acknowledgement.version < remoteDraft.version ||
        acknowledgement.version > remoteDraft.version + 1
      ) {
        throw new CloudProjectError(
          'CLOUD_INVALID_RESPONSE',
          'The project service returned an invalid draft version acknowledgement.',
          true,
        );
      }
      return this.projects.acknowledgeRemoteDraft({
        accountScope: scope,
        contentHash: acknowledgement.contentHash,
        localId: snapshot.localId,
        remoteSavedAt: acknowledgement.savedAt,
        remoteVersion: acknowledgement.version,
        syncedLocalRevision: snapshot.draftState.localRevision,
      });
    }

    return this.projects.completeSyncCheck(
      scope,
      snapshot.localId,
      remoteDraft?.version ?? snapshot.draftState.baseRemoteVersion!,
    );
  }

  private async withToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const accessToken = await this.auth.getValidAccessToken();
    if (!accessToken) {
      throw new CloudProjectError(
        'CLOUD_SESSION_EXPIRED',
        'Sign in before accessing cloud projects.',
        false,
      );
    }
    try {
      return await operation(accessToken);
    } catch (error) {
      if (!(error instanceof CloudProjectError) || error.code !== 'CLOUD_SESSION_EXPIRED') {
        throw error;
      }
      const refreshed = await this.auth.refreshAccessToken();
      if (!refreshed) throw error;
      return operation(refreshed);
    }
  }

  private emit(event: ProjectCloudEvent) {
    try {
      this.onEvent?.(event);
    } catch {
      // Observability must never change sync behavior.
    }
  }
}

function decodeCloudProjectSafely(
  project: CloudProject,
  draft: CloudProjectDraft | null,
  localId: string,
) {
  try {
    return decodeCloudProject(project, draft, localId);
  } catch (error) {
    if (!(error instanceof CloudProjectDocumentError)) throw error;
    throw new CloudProjectError(
      error.reason === 'unsupported' ? 'CLOUD_DRAFT_UNSUPPORTED' : 'CLOUD_INVALID_RESPONSE',
      error.message,
      false,
      undefined,
      { cause: error },
    );
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to refresh cloud projects.';
}
