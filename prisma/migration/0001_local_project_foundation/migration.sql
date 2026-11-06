CREATE TABLE projects (
  local_id TEXT PRIMARY KEY,
  account_scope TEXT NOT NULL,
  remote_project_id TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  name_normalization_version INTEGER NOT NULL,
  description TEXT,
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_scope, normalized_name)
) STRICT;

CREATE UNIQUE INDEX projects_remote_identity
  ON projects (account_scope, remote_project_id)
  WHERE remote_project_id IS NOT NULL;

CREATE INDEX projects_account_updated
  ON projects (account_scope, updated_at DESC);

CREATE TABLE workflow_documents (
  local_id TEXT NOT NULL REFERENCES projects(local_id) ON DELETE CASCADE,
  workflow_path TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (local_id, workflow_path)
) STRICT;

CREATE TABLE project_draft_state (
  local_id TEXT PRIMARY KEY REFERENCES projects(local_id) ON DELETE CASCADE,
  local_revision INTEGER NOT NULL DEFAULT 0 CHECK (local_revision >= 0),
  metadata_revision INTEGER NOT NULL DEFAULT 0 CHECK (metadata_revision >= 0),
  metadata_synced_revision INTEGER CHECK (metadata_synced_revision >= 0),
  base_remote_version INTEGER CHECK (base_remote_version >= 0),
  observed_remote_version INTEGER CHECK (observed_remote_version >= 0),
  last_synced_local_revision INTEGER CHECK (last_synced_local_revision >= 0),
  sync_status TEXT NOT NULL DEFAULT 'local-only' CHECK (
    sync_status IN (
      'local-only', 'local-ahead', 'syncing', 'synced', 'remote-ahead',
      'conflict', 'name-conflict', 'offline', 'error'
    )
  ),
  content_hash TEXT,
  remote_saved_at TEXT,
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  runtime_ir_json TEXT,
  validation_summary_json TEXT NOT NULL DEFAULT '{}',
  test_summary_json TEXT NOT NULL DEFAULT '{}'
) STRICT;

CREATE TABLE cloud_project_cache (
  account_scope TEXT NOT NULL,
  remote_project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  remote_updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (account_scope, remote_project_id)
) STRICT;

CREATE INDEX cloud_project_cache_account_name
  ON cloud_project_cache (account_scope, normalized_name);

CREATE TABLE cloud_project_cache_state (
  account_scope TEXT PRIMARY KEY,
  refreshed_at TEXT NOT NULL,
  next_cursor TEXT,
  completed INTEGER NOT NULL CHECK (completed IN (0, 1))
) STRICT;
