import type { MainAuthSession } from '@application/auth/auth-session';
import type {
  CloudProjectCacheRepository,
  LocalProjectRepository,
  LocalProjectSnapshot,
  LocalProjectSyncStatus,
} from '@application/project/local-project-repository';
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
  update(
    accessToken: string,
    projectId: string,
    input: { description?: string | null; name?: string },
  ): Promise<void>;
}

export type CloudProjectErrorCode =
  | 'CLOUD_ALREADY_SYNCED'
  | 'CLOUD_CONFIGURATION_ERROR'
  | 'CLOUD_DRAFT_VERSION_CONFLICT'
  | 'CLOUD_FORBIDDEN'
  | 'CLOUD_INVALID_INPUT'
  | 'CLOUD_INVALID_RESPONSE'
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
  load(): Promise<CloudProjectIndex>;
  refresh(): Promise<CloudProjectIndex>;
  syncFirst(localId: string): Promise<LocalProjectSnapshot>;
}

interface ProjectCloudServiceOptions {
  now?: () => string;
  pageSize?: number;
}

function jsonObject(value: JsonValue, label: string): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new CloudProjectError('CLOUD_INVALID_INPUT', `${label} must be a JSON object.`, false);
  }
  return value;
}

function copyAsJsonObject(value: unknown, label: string): JsonObject {
  return jsonObject(JSON.parse(JSON.stringify(value)) as JsonValue, label);
}

export function createCloudDraftPayload(snapshot: LocalProjectSnapshot): CloudProjectDraftPayload {
  const { document, draftState } = snapshot;
  return {
    expectedVersion: 0,
    editorGraph: copyAsJsonObject(
      {
        schemaVersion: document.manifest.schemaVersion,
        entryWorkflow: document.manifest.entryWorkflow,
        workflows: document.workflows,
      },
      'editorGraph',
    ),
    inputSchema: jsonObject(draftState.inputSchema, 'inputSchema'),
    runtimeIr: draftState.runtimeIr === null ? null : jsonObject(draftState.runtimeIr, 'runtimeIr'),
    validationSummary: jsonObject(draftState.validationSummary, 'validationSummary'),
    testSummary: jsonObject(draftState.testSummary, 'testSummary'),
  };
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

export class ProjectCloudService implements ProjectCloudClient {
  private readonly gateway: CloudProjectGateway;
  private readonly cache: CloudProjectCacheRepository;
  private readonly projects: LocalProjectRepository;
  private readonly auth: MainAuthSession;
  private readonly accountScope: () => Promise<string>;
  private readonly now: () => string;
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
    this.now = options.now ?? (() => new Date().toISOString());
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

  async syncFirst(localId: string): Promise<LocalProjectSnapshot> {
    const id = localId.trim();
    if (!id) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project ID is required.', false);
    }
    const scope = await this.accountScope();
    const syncKey = `${scope}\u0000${id}`;
    const current = this.syncs.get(syncKey);
    if (current) return current;
    const sync = this.runFirstSync(scope, id).finally(() => this.syncs.delete(syncKey));
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

  private async runFirstSync(scope: string, localId: string): Promise<LocalProjectSnapshot> {
    const snapshot = await this.projects.findById(scope, localId);
    if (!snapshot) {
      throw new CloudProjectError('CLOUD_INVALID_INPUT', 'Local project was not found.', false);
    }
    if (snapshot.draftState.baseRemoteVersion !== null) {
      throw new CloudProjectError(
        'CLOUD_ALREADY_SYNCED',
        'This project already has a cloud baseline. Re-sync belongs to Milestone C.',
        false,
      );
    }

    await this.projects.setSyncStatus(scope, localId, 'syncing');
    try {
      const index = await this.refreshStrict();
      let remoteProjectId = snapshot.remoteProjectId;
      if (!remoteProjectId) {
        const duplicate = index.projects.find(
          (project) =>
            normalizeCloudProjectName(project.name) ===
            normalizeCloudProjectName(snapshot.document.manifest.name),
        );
        if (duplicate && !snapshot.draftState.remoteCreatePending) {
          await this.projects.setSyncStatus(scope, localId, 'name-conflict');
          throw new CloudProjectError(
            'CLOUD_NAME_CONFLICT',
            'A cloud project already uses this name. Rename the local project before syncing.',
            false,
          );
        }

        await this.projects.beginRemoteCreate(scope, localId);
        const created = await this.withToken((token) =>
          this.gateway.create(token, {
            name: snapshot.document.manifest.name,
            description: snapshot.document.manifest.description?.trim() || null,
          }),
        );
        remoteProjectId = created.id;
        await this.projects.bindRemoteProject(scope, localId, remoteProjectId);
      }

      await this.withToken((token) =>
        this.gateway.update(token, remoteProjectId!, {
          name: snapshot.document.manifest.name,
          description: snapshot.document.manifest.description?.trim() || null,
        }),
      );
      await this.projects.acknowledgeMetadata(scope, localId, snapshot.draftState.metadataRevision);

      await this.withToken((token) => this.gateway.getDraft(token, remoteProjectId!));
      const acknowledgement = await this.withToken((token) =>
        this.gateway.putDraft(token, remoteProjectId!, createCloudDraftPayload(snapshot)),
      );
      return await this.projects.acknowledgeRemoteDraft({
        accountScope: scope,
        contentHash: acknowledgement.contentHash,
        localId,
        remoteSavedAt: acknowledgement.savedAt,
        remoteVersion: acknowledgement.version,
        syncedLocalRevision: snapshot.draftState.localRevision,
      });
    } catch (error) {
      if (error instanceof CloudProjectError && error.code === 'CLOUD_NAME_CONFLICT') throw error;
      const status: LocalProjectSyncStatus =
        error instanceof CloudProjectError &&
        ['CLOUD_NETWORK_UNAVAILABLE', 'CLOUD_TIMEOUT'].includes(error.code)
          ? 'offline'
          : error instanceof CloudProjectError && error.code === 'CLOUD_DRAFT_VERSION_CONFLICT'
            ? 'conflict'
            : 'error';
      await this.projects.setSyncStatus(scope, localId, status);
      throw error;
    }
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
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to refresh cloud projects.';
}
