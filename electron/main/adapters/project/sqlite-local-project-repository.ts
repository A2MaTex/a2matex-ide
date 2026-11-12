import type { DatabaseSync } from 'node:sqlite';

import {
  LocalProjectPersistenceError,
  type ApplyCloudProjectInput,
  type AcknowledgeRemoteDraftInput,
  type AcknowledgeRemoteMetadataInput,
  type CreateLocalProjectInput,
  type LocalDraftArtifacts,
  type LocalProjectDraftState,
  type LocalProjectRepository,
  type LocalProjectSnapshot,
  type LocalProjectSyncStatus,
  type ReplaceLocalFromCloudInput,
  type SaveLocalProjectInput,
} from '@application/project/local-project-repository';
import type { ProjectDocument } from '@domain/project/project';
import { encodeWorkflowDocument, projectDocumentSchema } from '@domain/project/project-schema';
import {
  LOCAL_PROJECT_NAME_NORMALIZATION_VERSION,
  normalizeProjectName,
} from '@domain/project/project-name';
import { parseStoredJson, serializeJson } from '@electron/main/persistence/json-storage';
import { SerializedProjectWriteQueue } from '@electron/main/persistence/serialized-project-write-queue';
import { withImmediateTransaction } from '@electron/main/persistence/studio-database';

interface ProjectRow {
  account_scope: string;
  base_remote_description: string | null;
  base_remote_name: string | null;
  base_remote_version: number | null;
  content_hash: string | null;
  created_at: string;
  input_schema_json: string;
  last_synced_local_revision: number | null;
  local_id: string;
  local_revision: number;
  manifest_json: string;
  metadata_revision: number;
  metadata_synced_revision: number | null;
  observed_remote_version: number | null;
  remote_project_id: string | null;
  remote_create_pending: number;
  remote_saved_at: string | null;
  runtime_ir_json: string | null;
  sync_status: LocalProjectSyncStatus;
  updated_at: string;
  validation_summary_json: string;
}

interface WorkflowRow {
  document_json: string;
  workflow_path: string;
}

const SELECT_PROJECT = `
  SELECT
    p.local_id,
    p.account_scope,
    p.remote_project_id,
    p.manifest_json,
    p.created_at,
    p.updated_at,
    d.local_revision,
    d.metadata_revision,
    d.metadata_synced_revision,
    d.base_remote_name,
    d.base_remote_description,
    d.base_remote_version,
    d.observed_remote_version,
    d.last_synced_local_revision,
    d.sync_status,
    d.content_hash,
    d.remote_saved_at,
    d.remote_create_pending,
    d.input_schema_json,
    d.runtime_ir_json,
    d.validation_summary_json
  FROM projects p
  INNER JOIN project_draft_state d ON d.local_id = p.local_id
`;

function projectKey(accountScope: string, localId: string) {
  return `${accountScope}\u0000${localId}`;
}

function requireIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}

function isUniqueNameError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(
      'UNIQUE constraint failed: projects.account_scope, projects.normalized_name',
    )
  );
}

function mapWriteError(error: unknown): never {
  if (error instanceof LocalProjectPersistenceError) throw error;
  if (isUniqueNameError(error)) {
    throw new LocalProjectPersistenceError(
      'DUPLICATE_PROJECT_NAME',
      'A local project with the same normalized name already exists in this account',
      false,
      { cause: error },
    );
  }
  throw new LocalProjectPersistenceError(
    'TRANSACTION_FAILED',
    'The local project transaction failed',
    true,
    { cause: error },
  );
}

function parseProjectSnapshot(database: DatabaseSync, row: ProjectRow): LocalProjectSnapshot {
  try {
    const workflowRows = database
      .prepare(
        `SELECT workflow_path, document_json
         FROM workflow_documents
         WHERE local_id = ?
         ORDER BY workflow_path`,
      )
      .all(row.local_id) as unknown as WorkflowRow[];
    const workflows = Object.fromEntries(
      workflowRows.map((workflow) => [
        workflow.workflow_path,
        parseStoredJson(workflow.document_json),
      ]),
    );
    const document = projectDocumentSchema.parse({
      manifest: parseStoredJson(row.manifest_json),
      workflows,
    });
    const draftState: LocalProjectDraftState = {
      baseRemoteDescription: row.base_remote_description,
      baseRemoteName: row.base_remote_name,
      baseRemoteVersion: row.base_remote_version,
      contentHash: row.content_hash,
      inputSchema: parseStoredJson(row.input_schema_json) as LocalDraftArtifacts['inputSchema'],
      lastSyncedLocalRevision: row.last_synced_local_revision,
      localRevision: row.local_revision,
      metadataRevision: row.metadata_revision,
      metadataSyncedRevision: row.metadata_synced_revision,
      observedRemoteVersion: row.observed_remote_version,
      remoteSavedAt: row.remote_saved_at,
      remoteCreatePending: row.remote_create_pending === 1,
      runtimeIr:
        row.runtime_ir_json === null
          ? null
          : (parseStoredJson(row.runtime_ir_json) as LocalDraftArtifacts['runtimeIr']),
      syncStatus: row.sync_status,
      validationSummary: parseStoredJson(
        row.validation_summary_json,
      ) as LocalDraftArtifacts['validationSummary'],
    };

    return {
      accountScope: row.account_scope,
      createdAt: row.created_at,
      document,
      draftState,
      localId: row.local_id,
      remoteProjectId: row.remote_project_id,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    throw new LocalProjectPersistenceError(
      'CORRUPTED_LOCAL_DATA',
      `Local project ${row.local_id} contains invalid persisted data`,
      false,
      { cause: error },
    );
  }
}

function readProject(
  database: DatabaseSync,
  accountScope: string,
  localId: string,
): LocalProjectSnapshot | null {
  const row = database
    .prepare(`${SELECT_PROJECT} WHERE p.account_scope = ? AND p.local_id = ?`)
    .get(accountScope, localId) as ProjectRow | undefined;
  return row ? parseProjectSnapshot(database, row) : null;
}

function artifactsOf(snapshot: LocalProjectSnapshot): LocalDraftArtifacts {
  return {
    inputSchema: snapshot.draftState.inputSchema,
    runtimeIr: snapshot.draftState.runtimeIr,
    validationSummary: snapshot.draftState.validationSummary,
  };
}

function artifactsEqual(left: LocalDraftArtifacts, right: LocalDraftArtifacts) {
  return serializeJson(left) === serializeJson(right);
}

function writeWorkflows(
  database: DatabaseSync,
  localId: string,
  document: ProjectDocument,
  timestamp: string,
) {
  const insertWorkflow = database.prepare(
    `INSERT INTO workflow_documents (
      local_id, workflow_path, schema_version, document_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const [workflowPath, workflow] of Object.entries(document.workflows)) {
    insertWorkflow.run(
      localId,
      workflowPath,
      workflow.schemaVersion,
      serializeJson(encodeWorkflowDocument(workflow)),
      timestamp,
      timestamp,
    );
  }
}

export class SqliteLocalProjectRepository implements LocalProjectRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly writes = new SerializedProjectWriteQueue(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private updateCheckpoint(
    accountScope: string,
    localId: string,
    operation: (current: LocalProjectSnapshot) => void,
  ) {
    const scope = requireIdentifier(accountScope, 'accountScope');
    const id = requireIdentifier(localId, 'localId');
    return this.writes.run(projectKey(scope, id), () => {
      try {
        return withImmediateTransaction(this.database, () => {
          const current = readProject(this.database, scope, id);
          if (!current) {
            throw new LocalProjectPersistenceError(
              'PROJECT_NOT_FOUND',
              `Local project ${id} was not found`,
            );
          }
          operation(current);
          return readProject(this.database, scope, id)!;
        });
      } catch (error) {
        return mapWriteError(error);
      }
    });
  }

  async beginRemoteCreate(accountScope: string, localId: string) {
    return this.updateCheckpoint(accountScope, localId, (current) => {
      this.database
        .prepare(
          `UPDATE project_draft_state
           SET remote_create_pending = 1, sync_status = 'syncing'
           WHERE local_id = ?`,
        )
        .run(current.localId);
    });
  }

  async bindRemoteProject(accountScope: string, localId: string, remoteProjectId: string) {
    const remoteId = requireIdentifier(remoteProjectId, 'remoteProjectId');
    return this.updateCheckpoint(accountScope, localId, (current) => {
      this.database
        .prepare(
          `UPDATE projects SET remote_project_id = ?
           WHERE account_scope = ? AND local_id = ?`,
        )
        .run(remoteId, current.accountScope, current.localId);
      this.database
        .prepare(
          `UPDATE project_draft_state
           SET remote_create_pending = 0, sync_status = 'syncing'
           WHERE local_id = ?`,
        )
        .run(current.localId);
    });
  }

  async acknowledgeMetadata(input: AcknowledgeRemoteMetadataInput) {
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
      throw new TypeError('revision must be a non-negative safe integer');
    }
    const name = requireIdentifier(input.name, 'name');
    return this.updateCheckpoint(input.accountScope, input.localId, (current) => {
      this.database
        .prepare(
          `UPDATE project_draft_state
           SET metadata_synced_revision = ?, base_remote_name = ?, base_remote_description = ?
           WHERE local_id = ?`,
        )
        .run(input.revision, name, input.description, current.localId);
    });
  }

  async acknowledgeRemoteDraft(input: AcknowledgeRemoteDraftInput) {
    if (!Number.isSafeInteger(input.remoteVersion) || input.remoteVersion < 1) {
      throw new TypeError('remoteVersion must be a positive safe integer');
    }
    if (!Number.isSafeInteger(input.syncedLocalRevision) || input.syncedLocalRevision < 0) {
      throw new TypeError('syncedLocalRevision must be a non-negative safe integer');
    }
    return this.updateCheckpoint(input.accountScope, input.localId, (current) => {
      const clean =
        current.draftState.localRevision === input.syncedLocalRevision &&
        current.draftState.metadataRevision === current.draftState.metadataSyncedRevision;
      this.database
        .prepare(
          `UPDATE project_draft_state
           SET base_remote_version = ?, observed_remote_version = ?,
               last_synced_local_revision = ?, content_hash = ?, remote_saved_at = ?,
               sync_status = ?
           WHERE local_id = ?`,
        )
        .run(
          input.remoteVersion,
          input.remoteVersion,
          input.syncedLocalRevision,
          requireIdentifier(input.contentHash, 'contentHash'),
          requireIdentifier(input.remoteSavedAt, 'remoteSavedAt'),
          clean ? 'synced' : 'local-ahead',
          current.localId,
        );
    });
  }

  async setSyncStatus(accountScope: string, localId: string, status: LocalProjectSyncStatus) {
    return this.updateCheckpoint(accountScope, localId, (current) => {
      this.database
        .prepare('UPDATE project_draft_state SET sync_status = ? WHERE local_id = ?')
        .run(status, current.localId);
    });
  }

  async observeRemote(
    accountScope: string,
    localId: string,
    observedRemoteVersion: number | null,
    status: Extract<LocalProjectSyncStatus, 'conflict' | 'remote-ahead'>,
  ) {
    return this.updateCheckpoint(accountScope, localId, (current) => {
      this.database
        .prepare(
          `UPDATE project_draft_state
           SET observed_remote_version = ?, sync_status = ?
           WHERE local_id = ?`,
        )
        .run(observedRemoteVersion, status, current.localId);
    });
  }

  async completeSyncCheck(accountScope: string, localId: string, observedRemoteVersion: number) {
    return this.updateCheckpoint(accountScope, localId, (current) => {
      const clean =
        current.draftState.localRevision === current.draftState.lastSyncedLocalRevision &&
        current.draftState.metadataRevision === current.draftState.metadataSyncedRevision;
      this.database
        .prepare(
          `UPDATE project_draft_state
           SET observed_remote_version = ?, sync_status = ?
           WHERE local_id = ?`,
        )
        .run(observedRemoteVersion, clean ? 'synced' : 'local-ahead', current.localId);
    });
  }

  async create(input: CreateLocalProjectInput): Promise<LocalProjectSnapshot> {
    const accountScope = requireIdentifier(input.accountScope, 'accountScope');
    const localId = requireIdentifier(input.localId, 'localId');

    return this.writes.run(projectKey(accountScope, localId), () => {
      try {
        const document = projectDocumentSchema.parse(input.document);
        const timestamp = this.now();
        withImmediateTransaction(this.database, () => {
          this.database
            .prepare(
              `INSERT INTO projects (
                local_id, account_scope, remote_project_id, name, normalized_name,
                name_normalization_version, description, manifest_json, created_at, updated_at
              ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              localId,
              accountScope,
              document.manifest.name,
              normalizeProjectName(document.manifest.name),
              LOCAL_PROJECT_NAME_NORMALIZATION_VERSION,
              document.manifest.description ?? null,
              serializeJson(document.manifest),
              timestamp,
              timestamp,
            );

          writeWorkflows(this.database, localId, document, timestamp);
          this.database
            .prepare('INSERT INTO project_draft_state (local_id) VALUES (?)')
            .run(localId);
        });

        return readProject(this.database, accountScope, localId)!;
      } catch (error) {
        return mapWriteError(error);
      }
    });
  }

  async findById(accountScope: string, localId: string): Promise<LocalProjectSnapshot | null> {
    return readProject(
      this.database,
      requireIdentifier(accountScope, 'accountScope'),
      requireIdentifier(localId, 'localId'),
    );
  }

  async findByRemoteId(
    accountScope: string,
    remoteProjectId: string,
  ): Promise<LocalProjectSnapshot | null> {
    const scope = requireIdentifier(accountScope, 'accountScope');
    const remoteId = requireIdentifier(remoteProjectId, 'remoteProjectId');
    const row = this.database
      .prepare(`${SELECT_PROJECT} WHERE p.account_scope = ? AND p.remote_project_id = ?`)
      .get(scope, remoteId) as ProjectRow | undefined;
    return row ? parseProjectSnapshot(this.database, row) : null;
  }

  async list(accountScope: string): Promise<LocalProjectSnapshot[]> {
    const normalizedScope = requireIdentifier(accountScope, 'accountScope');
    const rows = this.database
      .prepare(`${SELECT_PROJECT} WHERE p.account_scope = ? ORDER BY p.updated_at DESC, p.local_id`)
      .all(normalizedScope) as unknown as ProjectRow[];
    return rows.map((row) => parseProjectSnapshot(this.database, row));
  }

  async materializeCloudProject(input: ApplyCloudProjectInput): Promise<LocalProjectSnapshot> {
    const accountScope = requireIdentifier(input.accountScope, 'accountScope');
    const localId = requireIdentifier(input.localId, 'localId');
    const remoteProjectId = requireIdentifier(input.remoteProjectId, 'remoteProjectId');
    return this.writes.run(projectKey(accountScope, localId), () => {
      try {
        const document = projectDocumentSchema.parse(input.document);
        const timestamp = this.now();
        return withImmediateTransaction(this.database, () => {
          const existing = this.database
            .prepare(`${SELECT_PROJECT} WHERE p.account_scope = ? AND p.remote_project_id = ?`)
            .get(accountScope, remoteProjectId) as ProjectRow | undefined;
          if (existing) return parseProjectSnapshot(this.database, existing);

          this.database
            .prepare(
              `INSERT INTO projects (
                local_id, account_scope, remote_project_id, name, normalized_name,
                name_normalization_version, description, manifest_json, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              localId,
              accountScope,
              remoteProjectId,
              document.manifest.name,
              normalizeProjectName(document.manifest.name),
              LOCAL_PROJECT_NAME_NORMALIZATION_VERSION,
              document.manifest.description ?? null,
              serializeJson(document.manifest),
              timestamp,
              timestamp,
            );
          writeWorkflows(this.database, localId, document, timestamp);
          this.database
            .prepare(
              `INSERT INTO project_draft_state (
                local_id, metadata_synced_revision, base_remote_name,
                base_remote_description, base_remote_version, observed_remote_version,
                last_synced_local_revision, sync_status, content_hash, remote_saved_at,
                input_schema_json, runtime_ir_json, validation_summary_json
              ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              localId,
              requireIdentifier(input.baseRemoteName, 'baseRemoteName'),
              input.baseRemoteDescription,
              input.remoteVersion,
              input.remoteVersion,
              input.remoteVersion === null ? null : 0,
              input.remoteVersion === null ? 'local-ahead' : 'synced',
              input.contentHash,
              input.remoteSavedAt,
              serializeJson(input.artifacts.inputSchema),
              input.artifacts.runtimeIr === null ? null : serializeJson(input.artifacts.runtimeIr),
              serializeJson(input.artifacts.validationSummary),
            );
          return readProject(this.database, accountScope, localId)!;
        });
      } catch (error) {
        return mapWriteError(error);
      }
    });
  }

  async replaceFromCloud(input: ReplaceLocalFromCloudInput): Promise<LocalProjectSnapshot> {
    const accountScope = requireIdentifier(input.accountScope, 'accountScope');
    const localId = requireIdentifier(input.localId, 'localId');
    const remoteProjectId = requireIdentifier(input.remoteProjectId, 'remoteProjectId');
    return this.writes.run(projectKey(accountScope, localId), () => {
      try {
        const document = projectDocumentSchema.parse(input.document);
        return withImmediateTransaction(this.database, () => {
          const current = readProject(this.database, accountScope, localId);
          if (!current) {
            throw new LocalProjectPersistenceError(
              'PROJECT_NOT_FOUND',
              `Local project ${localId} was not found`,
            );
          }
          const clean =
            current.draftState.localRevision === current.draftState.lastSyncedLocalRevision &&
            current.draftState.metadataRevision === current.draftState.metadataSyncedRevision;
          if (
            current.remoteProjectId !== remoteProjectId ||
            current.draftState.localRevision !== input.expectedLocalRevision ||
            !clean
          ) {
            throw new LocalProjectPersistenceError(
              'LOCAL_REVISION_CONFLICT',
              'Local project changed while the cloud draft was loading',
              true,
            );
          }
          if (input.remoteVersion === null || !input.contentHash || !input.remoteSavedAt) {
            throw new LocalProjectPersistenceError(
              'TRANSACTION_FAILED',
              'A remote draft baseline is required when replacing a local project',
            );
          }

          const timestamp = this.now();
          const localRevision = current.draftState.localRevision + 1;
          const metadataChanged =
            current.document.manifest.name !== document.manifest.name ||
            (current.document.manifest.description ?? null) !==
              (document.manifest.description ?? null);
          const metadataRevision = current.draftState.metadataRevision + (metadataChanged ? 1 : 0);
          this.database
            .prepare(
              `UPDATE projects
               SET name = ?, normalized_name = ?, description = ?, manifest_json = ?, updated_at = ?
               WHERE account_scope = ? AND local_id = ?`,
            )
            .run(
              document.manifest.name,
              normalizeProjectName(document.manifest.name),
              document.manifest.description ?? null,
              serializeJson(document.manifest),
              timestamp,
              accountScope,
              localId,
            );
          this.database.prepare('DELETE FROM workflow_documents WHERE local_id = ?').run(localId);
          writeWorkflows(this.database, localId, document, timestamp);
          this.database
            .prepare(
              `UPDATE project_draft_state
               SET local_revision = ?, last_synced_local_revision = ?,
                   metadata_revision = ?, metadata_synced_revision = ?,
                   base_remote_name = ?, base_remote_description = ?,
                   base_remote_version = ?, observed_remote_version = ?, sync_status = 'synced',
                   content_hash = ?, remote_saved_at = ?, input_schema_json = ?,
                   runtime_ir_json = ?, validation_summary_json = ?
               WHERE local_id = ?`,
            )
            .run(
              localRevision,
              localRevision,
              metadataRevision,
              metadataRevision,
              requireIdentifier(input.baseRemoteName, 'baseRemoteName'),
              input.baseRemoteDescription,
              input.remoteVersion,
              input.remoteVersion,
              input.contentHash,
              input.remoteSavedAt,
              serializeJson(input.artifacts.inputSchema),
              input.artifacts.runtimeIr === null ? null : serializeJson(input.artifacts.runtimeIr),
              serializeJson(input.artifacts.validationSummary),
              localId,
            );
          return readProject(this.database, accountScope, localId)!;
        });
      } catch (error) {
        return mapWriteError(error);
      }
    });
  }

  async save(input: SaveLocalProjectInput): Promise<LocalProjectSnapshot> {
    const accountScope = requireIdentifier(input.accountScope, 'accountScope');
    const localId = requireIdentifier(input.localId, 'localId');

    return this.writes.run(projectKey(accountScope, localId), () => {
      try {
        const document = projectDocumentSchema.parse(input.document);
        return withImmediateTransaction(this.database, () => {
          const current = readProject(this.database, accountScope, localId);
          if (!current) {
            throw new LocalProjectPersistenceError(
              'PROJECT_NOT_FOUND',
              `Local project ${localId} was not found`,
            );
          }
          if (current.draftState.localRevision !== input.expectedLocalRevision) {
            throw new LocalProjectPersistenceError(
              'LOCAL_REVISION_CONFLICT',
              `Expected local revision ${input.expectedLocalRevision}, found ${current.draftState.localRevision}`,
              true,
            );
          }

          const persistedArtifacts = artifactsOf(current);
          const metadataChanged =
            serializeJson(current.document.manifest) !== serializeJson(document.manifest);
          const workflowsChanged =
            serializeJson(current.document.workflows) !== serializeJson(document.workflows);
          const artifacts =
            input.artifacts ??
            (workflowsChanged
              ? {
                  ...persistedArtifacts,
                  runtimeIr: null,
                  validationSummary: {},
                }
              : persistedArtifacts);
          const draftArtifactsChanged = !artifactsEqual(persistedArtifacts, artifacts);
          if (!metadataChanged && !workflowsChanged && !draftArtifactsChanged) return current;

          const timestamp = this.now();
          const localRevision = current.draftState.localRevision + 1;
          const metadataRevision = current.draftState.metadataRevision + (metadataChanged ? 1 : 0);
          const syncStatus: LocalProjectSyncStatus = current.remoteProjectId
            ? 'local-ahead'
            : 'local-only';

          this.database
            .prepare(
              `UPDATE projects
               SET name = ?, normalized_name = ?, description = ?, manifest_json = ?, updated_at = ?
               WHERE account_scope = ? AND local_id = ?`,
            )
            .run(
              document.manifest.name,
              normalizeProjectName(document.manifest.name),
              document.manifest.description ?? null,
              serializeJson(document.manifest),
              timestamp,
              accountScope,
              localId,
            );

          if (workflowsChanged) {
            this.database.prepare('DELETE FROM workflow_documents WHERE local_id = ?').run(localId);
            writeWorkflows(this.database, localId, document, timestamp);
          }

          this.database
            .prepare(
              `UPDATE project_draft_state
               SET local_revision = ?, metadata_revision = ?, sync_status = ?,
                   input_schema_json = ?, runtime_ir_json = ?, validation_summary_json = ?
               WHERE local_id = ?`,
            )
            .run(
              localRevision,
              metadataRevision,
              syncStatus,
              serializeJson(artifacts.inputSchema),
              artifacts.runtimeIr === null ? null : serializeJson(artifacts.runtimeIr),
              serializeJson(artifacts.validationSummary),
              localId,
            );

          return readProject(this.database, accountScope, localId)!;
        });
      } catch (error) {
        return mapWriteError(error);
      }
    });
  }
}
