import type { ProjectDocument } from '@domain/project/project';

export interface ProjectLocation {
  id: string;
  displayPath: string;
}

export interface ProjectSnapshot {
  location: ProjectLocation;
  document: ProjectDocument;
  migration?: { fromVersion: number; toVersion: number };
}

export interface SaveProjectResult {
  location: ProjectLocation;
  savedAt: string;
}

export interface CreateProjectInput {
  name: string;
  parent: ProjectLocation;
}

export interface ProjectRepository {
  chooseCreateParent(): Promise<ProjectLocation | null>;
  chooseOpenLocation(): Promise<ProjectLocation | null>;
  chooseSaveAsLocation(): Promise<ProjectLocation | null>;
  create(input: CreateProjectInput): Promise<ProjectSnapshot>;
  open(location: ProjectLocation): Promise<ProjectSnapshot>;
  save(snapshot: ProjectSnapshot): Promise<SaveProjectResult>;
  saveAs(snapshot: ProjectSnapshot, target: ProjectLocation): Promise<SaveProjectResult>;
}

export type ProjectErrorCode =
  | 'PROJECT_ALREADY_EXISTS'
  | 'PROJECT_FORMAT_INVALID'
  | 'PROJECT_LOCATION_INVALID'
  | 'PROJECT_NAME_INVALID'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_SCHEMA_UNSUPPORTED'
  | 'PROJECT_WRITE_FAILED';

export class ProjectRepositoryError extends Error {
  readonly code: ProjectErrorCode;
  readonly retryable: boolean;

  constructor(code: ProjectErrorCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = 'ProjectRepositoryError';
  }
}
