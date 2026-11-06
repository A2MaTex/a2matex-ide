import type { LocalProjectSnapshot } from '@application/project/local-project-repository';
import type { ProjectDocument } from '@domain/project/project';

export type ProjectSnapshot = LocalProjectSnapshot;

export interface CreateProjectInput {
  description?: string;
  name: string;
}

export interface SaveProjectInput {
  document: ProjectDocument;
  expectedLocalRevision: number;
  localId: string;
}

export interface ExportProjectInput {
  document: ProjectDocument;
}

export interface ExportProjectResult {
  displayPath: string;
  savedAt: string;
}

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectSnapshot>;
  exportProject(input: ExportProjectInput): Promise<ExportProjectResult | null>;
  importProject(): Promise<ProjectSnapshot | null>;
  list(): Promise<ProjectSnapshot[]>;
  open(localId: string): Promise<ProjectSnapshot>;
  save(input: SaveProjectInput): Promise<ProjectSnapshot>;
}

export type ProjectErrorCode =
  | 'CORRUPTED_LOCAL_DATA'
  | 'DATABASE_MIGRATION_FAILED'
  | 'DUPLICATE_PROJECT_NAME'
  | 'LOCAL_REVISION_CONFLICT'
  | 'PROJECT_ACCOUNT_UNAVAILABLE'
  | 'PROJECT_ALREADY_EXISTS'
  | 'PROJECT_DESCRIPTION_INVALID'
  | 'PROJECT_FORMAT_INVALID'
  | 'PROJECT_LOCATION_INVALID'
  | 'PROJECT_NAME_INVALID'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_SCHEMA_UNSUPPORTED'
  | 'PROJECT_WRITE_FAILED'
  | 'TRANSACTION_FAILED';

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
