import type {
  LocalProjectSnapshot,
  LocalProjectSyncStatus,
} from '@application/project/local-project-repository';
import type { CloudProjectErrorCode } from '@application/project/project-cloud.error';
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
  validationSummary: JsonObject;
  version: number;
}

export interface CloudProjectDraftPayload {
  expectedVersion: number;
  editorGraph: JsonObject;
  inputSchema: JsonObject;
  runtimeIr: JsonObject | null;
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
