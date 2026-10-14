import type {
  CreateProjectInput,
  ProjectErrorCode,
  ProjectLocation,
  ProjectSnapshot,
  SaveProjectResult,
} from '../../application/project/project-repository.js';
import type { HostInfo } from '../../application/system/host-gateway.js';

export interface HostError {
  code: ProjectErrorCode;
  message: string;
  retryable: boolean;
}

export type HostResult<T> = { ok: true; value: T } | { ok: false; error: HostError };

export interface StudioHostApi {
  system: {
    getInfo(): Promise<HostInfo>;
  };
  project: {
    chooseCreateParent(): Promise<HostResult<ProjectLocation | null>>;
    chooseOpenLocation(): Promise<HostResult<ProjectLocation | null>>;
    chooseSaveAsLocation(): Promise<HostResult<ProjectLocation | null>>;
    create(input: CreateProjectInput): Promise<HostResult<ProjectSnapshot>>;
    open(location: ProjectLocation): Promise<HostResult<ProjectSnapshot>>;
    save(snapshot: ProjectSnapshot): Promise<HostResult<SaveProjectResult>>;
    saveAs(input: {
      snapshot: ProjectSnapshot;
      target: ProjectLocation;
    }): Promise<HostResult<SaveProjectResult>>;
  };
}
