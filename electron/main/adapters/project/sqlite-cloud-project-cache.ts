import type { DatabaseSync } from 'node:sqlite';

import {
  LocalProjectPersistenceError,
  type CachedCloudProject,
  type CloudProjectCacheRefresh,
  type CloudProjectCacheRepository,
} from '@application/project/local-project-repository';
import type { JsonValue } from '@shared/types/json-value';
import { parseStoredJson, serializeJson } from '@electron/main/persistence/json-storage';
import { SerializedProjectWriteQueue } from '@electron/main/persistence/serialized-project-write-queue';
import { withImmediateTransaction } from '@electron/main/persistence/studio-database';

interface CacheRow {
  account_scope: string;
  description: string | null;
  name: string;
  normalized_name: string;
  payload_json: string;
  remote_project_id: string;
  remote_updated_at: string;
  status: string;
}

interface CacheStateRow {
  account_scope: string;
  completed: number;
  next_cursor: string | null;
  refreshed_at: string;
}

function requireAccountScope(value: string) {
  const accountScope = value.trim();
  if (!accountScope) throw new TypeError('accountScope must not be empty');
  return accountScope;
}

function mapCacheError(error: unknown): never {
  if (error instanceof LocalProjectPersistenceError) throw error;
  throw new LocalProjectPersistenceError(
    'TRANSACTION_FAILED',
    'The cloud project cache transaction failed',
    true,
    { cause: error },
  );
}

export class SqliteCloudProjectCache implements CloudProjectCacheRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly writes = new SerializedProjectWriteQueue(),
  ) {}

  async list(accountScope: string): Promise<CachedCloudProject[]> {
    const rows = this.database
      .prepare(
        `SELECT account_scope, remote_project_id, name, normalized_name, description,
                status, remote_updated_at, payload_json
         FROM cloud_project_cache
         WHERE account_scope = ?
         ORDER BY remote_updated_at DESC, remote_project_id`,
      )
      .all(requireAccountScope(accountScope)) as unknown as CacheRow[];

    try {
      return rows.map((row) => ({
        accountScope: row.account_scope,
        description: row.description,
        name: row.name,
        normalizedName: row.normalized_name,
        payload: parseStoredJson(row.payload_json) as JsonValue,
        remoteProjectId: row.remote_project_id,
        remoteUpdatedAt: row.remote_updated_at,
        status: row.status,
      }));
    } catch (error) {
      throw new LocalProjectPersistenceError(
        'CORRUPTED_LOCAL_DATA',
        'The cached cloud project index contains invalid data',
        false,
        { cause: error },
      );
    }
  }

  async replace(
    accountScope: string,
    projects: readonly Omit<CachedCloudProject, 'accountScope'>[],
    refresh: Omit<CloudProjectCacheRefresh, 'accountScope'>,
  ): Promise<void> {
    const normalizedScope = requireAccountScope(accountScope);
    return this.writes.run(`cloud-cache\u0000${normalizedScope}`, () => {
      try {
        withImmediateTransaction(this.database, () => {
          this.database
            .prepare('DELETE FROM cloud_project_cache WHERE account_scope = ?')
            .run(normalizedScope);
          const insert = this.database.prepare(
            `INSERT INTO cloud_project_cache (
              account_scope, remote_project_id, name, normalized_name, description,
              status, remote_updated_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const project of projects) {
            insert.run(
              normalizedScope,
              project.remoteProjectId,
              project.name,
              project.normalizedName,
              project.description,
              project.status,
              project.remoteUpdatedAt,
              serializeJson(project.payload),
            );
          }
          this.database
            .prepare(
              `INSERT INTO cloud_project_cache_state (
                account_scope, refreshed_at, next_cursor, completed
              ) VALUES (?, ?, ?, ?)
              ON CONFLICT (account_scope) DO UPDATE SET
                refreshed_at = excluded.refreshed_at,
                next_cursor = excluded.next_cursor,
                completed = excluded.completed`,
            )
            .run(
              normalizedScope,
              refresh.refreshedAt,
              refresh.nextCursor,
              refresh.completed ? 1 : 0,
            );
        });
      } catch (error) {
        mapCacheError(error);
      }
    });
  }

  async state(accountScope: string): Promise<CloudProjectCacheRefresh | null> {
    const row = this.database
      .prepare(
        `SELECT account_scope, refreshed_at, next_cursor, completed
         FROM cloud_project_cache_state
         WHERE account_scope = ?`,
      )
      .get(requireAccountScope(accountScope)) as CacheStateRow | undefined;
    if (!row) return null;
    return {
      accountScope: row.account_scope,
      completed: row.completed === 1,
      nextCursor: row.next_cursor,
      refreshedAt: row.refreshed_at,
    };
  }
}
