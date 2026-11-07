import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { LocalProjectPersistenceError } from '@application/project/local-project-repository';
import { LOCAL_PROJECT_NAME_NORMALIZATION_VERSION } from '@domain/project/project-name';

const CURRENT_DATABASE_VERSION = 3;
const DATABASE_FILE_NAME = 'studio.sqlite3';

const migrations = [
  {
    version: 1,
    relativePath: '0001_local_project_foundation/migration.sql',
  },
  {
    version: 2,
    relativePath: '0002_cloud_sync_checkpoint/migration.sql',
  },
  {
    version: 3,
    relativePath: '0003_remote_metadata_baseline/migration.sql',
  },
] as const;

export interface StudioDatabase {
  readonly connection: DatabaseSync;
  readonly filePath: string;
  close(): void;
}

function readDatabaseVersion(database: DatabaseSync) {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

export function withImmediateTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the operation error; a failed rollback leaves the connection unusable.
    }
    throw error;
  }
}

function migrate(database: DatabaseSync, migrationsPath: string) {
  const initialVersion = readDatabaseVersion(database);
  if (initialVersion > CURRENT_DATABASE_VERSION) {
    throw new Error(
      `Database version ${initialVersion} is newer than supported version ${CURRENT_DATABASE_VERSION}`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= initialVersion) continue;
    withImmediateTransaction(database, () => {
      database.exec(readFileSync(path.join(migrationsPath, migration.relativePath), 'utf8'));
      database.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }
}

function backupBeforeMigration(database: DatabaseSync, filePath: string) {
  const version = readDatabaseVersion(database);
  if (filePath === ':memory:' || version === 0 || version >= CURRENT_DATABASE_VERSION) return;
  const backupPath = `${filePath}.pre-v${CURRENT_DATABASE_VERSION}.bak`;
  if (existsSync(backupPath)) return;
  database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  chmodSync(backupPath, 0o600);
}

export function openStudioDatabase(input: {
  filePath?: string;
  migrationsPath?: string;
  userDataPath?: string;
}): StudioDatabase {
  if (!input.filePath && !input.userDataPath) {
    throw new TypeError('filePath or userDataPath is required');
  }
  const filePath = input.filePath ?? path.join(input.userDataPath!, 'data', DATABASE_FILE_NAME);
  const migrationsPath = input.migrationsPath ?? path.resolve('prisma', 'migration');
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), { mode: 0o700, recursive: true });

  const database = new DatabaseSync(filePath);
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA busy_timeout = 5000');
    if (filePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
    backupBeforeMigration(database, filePath);
    migrate(database, migrationsPath);
    database.exec(`PRAGMA application_id = 0x41324d58`);
  } catch (error) {
    database.close();
    throw new LocalProjectPersistenceError(
      'DATABASE_MIGRATION_FAILED',
      'Local project database could not be initialized',
      false,
      { cause: error },
    );
  }

  return {
    connection: database,
    filePath,
    close: () => database.close(),
  };
}

export function getStudioDatabaseMetadata(database: DatabaseSync) {
  return {
    databaseVersion: readDatabaseVersion(database),
    nameNormalizationVersion: LOCAL_PROJECT_NAME_NORMALIZATION_VERSION,
  };
}
