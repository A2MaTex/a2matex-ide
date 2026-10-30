import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectLocation } from '@application/project/project-repository';

export type LocationKind = 'parent' | 'project' | 'target';

interface LocationGrant {
  kind: LocationKind;
  path: string;
}

export class LocationGrantError extends Error {
  readonly code = 'PROJECT_LOCATION_INVALID' as const;
}

export class LocationRegistry {
  private readonly grants = new Map<string, LocationGrant>();

  async register(directory: string, kind: LocationKind): Promise<ProjectLocation> {
    const canonicalPath = await realpath(path.resolve(directory));
    const metadata = await stat(canonicalPath);
    if (!metadata.isDirectory() || canonicalPath === path.parse(canonicalPath).root) {
      throw new LocationGrantError('Project location must be a non-root directory');
    }

    const id = randomUUID();
    this.grants.set(id, { kind, path: canonicalPath });
    return { id, displayPath: canonicalPath };
  }

  resolve(location: ProjectLocation, allowedKinds: LocationKind[]): string {
    if (!location || typeof location.id !== 'string') {
      throw new LocationGrantError('Project location is malformed');
    }
    const grant = this.grants.get(location.id);
    if (!grant || !allowedKinds.includes(grant.kind)) {
      throw new LocationGrantError('Project location grant is invalid or expired');
    }
    return grant.path;
  }

  clear() {
    this.grants.clear();
  }
}
