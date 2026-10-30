import type {
  CreateProjectInput,
  ProjectErrorCode,
  ProjectLocation,
  ProjectSnapshot,
  SaveProjectResult,
} from '@application/project/project-repository';
import type { AuthErrorCode, LoginInput, SessionState } from '@application/auth/auth-session';
import type { NodeCatalogErrorCode } from '@application/node-catalog/node-catalog';
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
  };
  catalog: {
    load(runtimeVersion: string): Promise<HostResult<NodeCatalogSnapshot, NodeCatalogErrorCode>>;
    refresh(runtimeVersion: string): Promise<HostResult<NodeCatalogSnapshot, NodeCatalogErrorCode>>;
  };
  project: {
    chooseCreateParent(): Promise<HostResult<ProjectLocation | null, ProjectErrorCode>>;
    chooseOpenLocation(): Promise<HostResult<ProjectLocation | null, ProjectErrorCode>>;
    chooseSaveAsLocation(): Promise<HostResult<ProjectLocation | null, ProjectErrorCode>>;
    create(input: CreateProjectInput): Promise<HostResult<ProjectSnapshot, ProjectErrorCode>>;
    open(location: ProjectLocation): Promise<HostResult<ProjectSnapshot, ProjectErrorCode>>;
    save(snapshot: ProjectSnapshot): Promise<HostResult<SaveProjectResult, ProjectErrorCode>>;
    saveAs(input: {
      snapshot: ProjectSnapshot;
      target: ProjectLocation;
    }): Promise<HostResult<SaveProjectResult, ProjectErrorCode>>;
  };
}
