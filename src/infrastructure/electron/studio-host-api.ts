import type {
  ExportProjectInput,
  ExportProjectResult,
  CreateProjectInput,
  ProjectErrorCode,
  ProjectSnapshot,
  SaveProjectInput,
} from '@application/project/project-repository';
import type { AuthErrorCode, LoginInput, SessionState } from '@application/auth/auth-session';
import type { NodeCatalogErrorCode } from '@application/node-catalog/node-catalog';
import type {
  CloudProject,
  CloudProjectErrorCode,
  CloudProjectIndex,
  UpdateCloudProjectInput,
} from '@application/project/project-cloud';
import type { HostInfo } from '@application/system/host-gateway';
import type { NodeCatalogSnapshot } from '@domain/node-catalog/node-catalog';

export interface HostError<TCode extends string = string> {
  code: TCode;
  message: string;
  retryable: boolean;
}

export type HostResult<T, TCode extends string = string> =
  { ok: true; value: T } | { ok: false; error: HostError<TCode> };

export interface StudioHostApi {
  system: {
    getInfo(): Promise<HostInfo>;
  };
  auth: {
    restore(): Promise<HostResult<SessionState, AuthErrorCode>>;
    login(input: LoginInput): Promise<HostResult<SessionState, AuthErrorCode>>;
    logout(): Promise<HostResult<SessionState, AuthErrorCode>>;
    onSessionChanged(listener: (session: SessionState) => void): () => void;
  };
  catalog: {
    load(runtimeVersion: string): Promise<HostResult<NodeCatalogSnapshot, NodeCatalogErrorCode>>;
    refresh(runtimeVersion: string): Promise<HostResult<NodeCatalogSnapshot, NodeCatalogErrorCode>>;
  };
  cloudProject: {
    archive(projectId: string): Promise<HostResult<CloudProject, CloudProjectErrorCode>>;
    getDetail(projectId: string): Promise<HostResult<CloudProject, CloudProjectErrorCode>>;
    load(): Promise<HostResult<CloudProjectIndex, CloudProjectErrorCode>>;
    refresh(): Promise<HostResult<CloudProjectIndex, CloudProjectErrorCode>>;
    sync(localId: string): Promise<HostResult<ProjectSnapshot, CloudProjectErrorCode>>;
    update(
      projectId: string,
      update: UpdateCloudProjectInput,
      localId?: string,
    ): Promise<HostResult<CloudProject, CloudProjectErrorCode>>;
  };
  project: {
    create(input: CreateProjectInput): Promise<HostResult<ProjectSnapshot, ProjectErrorCode>>;
    exportProject(
      input: ExportProjectInput,
    ): Promise<HostResult<ExportProjectResult | null, ProjectErrorCode>>;
    importProject(): Promise<HostResult<ProjectSnapshot | null, ProjectErrorCode>>;
    list(): Promise<HostResult<ProjectSnapshot[], ProjectErrorCode>>;
    open(localId: string): Promise<HostResult<ProjectSnapshot, ProjectErrorCode>>;
    save(input: SaveProjectInput): Promise<HostResult<ProjectSnapshot, ProjectErrorCode>>;
  };
}
