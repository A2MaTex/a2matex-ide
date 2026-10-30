import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { NodeCatalogCache } from '@application/node-catalog/node-catalog';
import {
  nodeCatalogSnapshotSchema,
  type NodeCatalogScope,
  type NodeCatalogSnapshot,
} from '@domain/node-catalog/node-catalog';

const MAX_CACHE_BYTES = 2 * 1024 * 1024;

function sameScope(left: NodeCatalogScope, right: NodeCatalogScope) {
  return (
    left.server === right.server &&
    left.account === right.account &&
    left.runtimeVersion === right.runtimeVersion
  );
}

export class FileNodeCatalogCache implements NodeCatalogCache {
  private readonly directory: string;

  constructor(userDataPath: string) {
    this.directory = path.join(userDataPath, 'catalog-cache-v3');
  }

  async read(scope: NodeCatalogScope): Promise<NodeCatalogSnapshot | null> {
    const filePath = this.filePath(scope);
    try {
      const metadata = await lstat(filePath);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_CACHE_BYTES) {
        return null;
      }
      const parsed = nodeCatalogSnapshotSchema.safeParse(
        JSON.parse(await readFile(filePath, 'utf8')),
      );
      if (!parsed.success || !sameScope(parsed.data.scope, scope)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  async write(snapshot: NodeCatalogSnapshot): Promise<void> {
    const parsed = nodeCatalogSnapshotSchema.parse(snapshot);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const filePath = this.filePath(parsed.scope);
    const temporaryPath = path.join(
      this.directory,
      `.${path.basename(filePath)}.${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(parsed)}\n`, 'utf8');
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

  private filePath(scope: NodeCatalogScope) {
    const key = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
    return path.join(this.directory, `${key}.json`);
  }
}
