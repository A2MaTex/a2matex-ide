import type { LocalProjectSnapshot } from '@application/project/local-project.types';
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
