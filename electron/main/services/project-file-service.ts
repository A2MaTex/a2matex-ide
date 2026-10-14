import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  CreateProjectInput,
  ProjectLocation,
  ProjectSnapshot,
  SaveProjectResult,
} from '../../../src/application/project/project-repository.js';
import {
  PROJECT_MANIFEST_FILE,
  type ProjectDocument,
  type WorkflowDocument,
} from '../../../src/domain/project/project.js';
import { createEmptyProjectDocument } from '../../../src/domain/project/project-factory.js';
import {
  migrateProjectManifest,
  parseWorkflowDocument,
  ProjectFormatError,
} from '../../../src/domain/project/project-migration.js';
import { projectDocumentSchema } from '../../../src/domain/project/project-schema.js';
import { LocationGrantError, LocationRegistry } from '../security/location-registry.js';

const MAX_JSON_FILE_BYTES = 5 * 1024 * 1024;

export class ProjectFileError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_ALREADY_EXISTS'
      | 'PROJECT_FORMAT_INVALID'
      | 'PROJECT_LOCATION_INVALID'
      | 'PROJECT_NAME_INVALID'
      | 'PROJECT_NOT_FOUND'
      | 'PROJECT_SCHEMA_UNSUPPORTED'
      | 'PROJECT_WRITE_FAILED',
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

function directoryNameFromProject(name: string) {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || 'a2matex-project';
}

function resolveInside(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new ProjectFileError('PROJECT_LOCATION_INVALID', 'Project file escapes project root');
  }
  return target;
}

async function assertRegularFile(filePath: string) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_JSON_FILE_BYTES) {
    throw new ProjectFileError('PROJECT_FORMAT_INVALID', 'Project file is not a safe JSON file');
  }
}

async function readJson(filePath: string): Promise<unknown> {
  await assertRegularFile(filePath);
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new ProjectFileError('PROJECT_FORMAT_INVALID', 'Project contains invalid JSON');
  }
}

export async function atomicWriteJson(filePath: string, value: unknown) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeDocument(root: string, document: ProjectDocument) {
  const parsed = projectDocumentSchema.parse(document);
  const workflowsDirectory = resolveInside(root, 'workflows');
  await mkdir(workflowsDirectory, { recursive: true });
  const workflowMetadata = await lstat(workflowsDirectory);
  if (workflowMetadata.isSymbolicLink()) {
    throw new ProjectFileError(
      'PROJECT_LOCATION_INVALID',
      'Workflow directory may not be a symlink',
    );
  }

  for (const workflowPath of parsed.manifest.workflows) {
    await atomicWriteJson(resolveInside(root, workflowPath), parsed.workflows[workflowPath]);
  }
  await atomicWriteJson(resolveInside(root, PROJECT_MANIFEST_FILE), parsed.manifest);
}

async function readDocument(root: string): Promise<{
  document: ProjectDocument;
  migratedFrom?: number;
}> {
  const manifestPath = resolveInside(root, PROJECT_MANIFEST_FILE);
  const { manifest, migratedFrom } = migrateProjectManifest(await readJson(manifestPath));
  const workflows: Record<string, WorkflowDocument> = {};
  for (const workflowPath of manifest.workflows) {
    workflows[workflowPath] = parseWorkflowDocument(
      await readJson(resolveInside(root, workflowPath)),
    );
  }
  const document = projectDocumentSchema.parse({ manifest, workflows });
  return { document, ...(migratedFrom === undefined ? {} : { migratedFrom }) };
}

export class ProjectFileService {
  constructor(private readonly locations: LocationRegistry) {}

  async create(input: CreateProjectInput): Promise<ProjectSnapshot> {
    const normalizedName = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!normalizedName || normalizedName.length > 100) {
      throw new ProjectFileError(
        'PROJECT_NAME_INVALID',
        'Project name must contain between 1 and 100 characters',
      );
    }

    const parent = this.locations.resolve(input.parent, ['parent']);
    const target = resolveInside(parent, directoryNameFromProject(normalizedName));
    try {
      await mkdir(target, { recursive: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ProjectFileError('PROJECT_ALREADY_EXISTS', 'A project folder already exists');
      }
      throw error;
    }

    const document = createEmptyProjectDocument(randomUUID(), normalizedName);
    try {
      await writeDocument(target, document);
    } catch (error) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    const location = await this.locations.register(target, 'project');
    return { location, document };
  }

  async open(location: ProjectLocation): Promise<ProjectSnapshot> {
    const root = this.locations.resolve(location, ['project']);
    const { document, migratedFrom } = await readDocument(root);
    return {
      location,
      document,
      ...(migratedFrom === undefined
        ? {}
        : { migration: { fromVersion: migratedFrom, toVersion: 1 } }),
    };
  }

  async save(snapshot: ProjectSnapshot): Promise<SaveProjectResult> {
    const root = this.locations.resolve(snapshot.location, ['project']);
    await writeDocument(root, snapshot.document);
    return { location: snapshot.location, savedAt: new Date().toISOString() };
  }

  async saveAs(snapshot: ProjectSnapshot, target: ProjectLocation): Promise<SaveProjectResult> {
    const root = this.locations.resolve(target, ['target']);
    const files = await readdir(root);
    if (files.length > 0) {
      throw new ProjectFileError('PROJECT_ALREADY_EXISTS', 'Save As destination must be empty');
    }
    await writeDocument(root, snapshot.document);
    const location = await this.locations.register(root, 'project');
    return { location, savedAt: new Date().toISOString() };
  }
}

export function mapProjectFileError(error: unknown): ProjectFileError {
  if (error instanceof ProjectFileError) return error;
  if (error instanceof LocationGrantError) {
    return new ProjectFileError('PROJECT_LOCATION_INVALID', error.message);
  }
  if (error instanceof ProjectFormatError) {
    return new ProjectFileError(error.code, error.message);
  }
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return new ProjectFileError('PROJECT_NOT_FOUND', 'Project file or folder was not found');
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return new ProjectFileError('PROJECT_FORMAT_INVALID', 'Project data failed validation');
  }
  return new ProjectFileError('PROJECT_WRITE_FAILED', 'Project operation failed', true);
}
