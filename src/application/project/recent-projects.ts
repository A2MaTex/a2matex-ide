import type { CloudProject } from '@application/project/project-cloud';
import type { LocalProjectSnapshot } from '@application/project/local-project-repository';
import { normalizeCloudProjectName } from '@domain/project/project-name';

export interface RecentProjectItem {
  cloud: CloudProject | null;
  effectiveUpdatedAt: string;
  key: string;
  local: LocalProjectSnapshot | null;
  name: string;
  state: 'bound' | 'cloud-only' | 'local-only' | 'name-conflict';
}

function effectiveTimestamp(local: LocalProjectSnapshot | null, cloud: CloudProject | null) {
  const localTimestamp = local?.updatedAt ?? '';
  const cloudTimestamp = cloud?.updatedAt ?? cloud?.createdAt ?? '';
  return localTimestamp > cloudTimestamp ? localTimestamp : cloudTimestamp;
}

export function mergeRecentProjects(
  localProjects: readonly LocalProjectSnapshot[],
  cloudProjects: readonly CloudProject[],
): RecentProjectItem[] {
  const remoteById = new Map(cloudProjects.map((project) => [project.id, project]));
  const unboundRemoteNames = new Set(
    cloudProjects.map((project) => normalizeCloudProjectName(project.name)),
  );
  const claimed = new Set<string>();
  const items: RecentProjectItem[] = localProjects.map((local) => {
    const cloud = local.remoteProjectId ? (remoteById.get(local.remoteProjectId) ?? null) : null;
    if (cloud) claimed.add(cloud.id);
    const nameConflict =
      !local.remoteProjectId &&
      unboundRemoteNames.has(normalizeCloudProjectName(local.document.manifest.name));
    return {
      cloud,
      effectiveUpdatedAt: effectiveTimestamp(local, cloud),
      key: `local:${local.localId}`,
      local,
      name: local.document.manifest.name,
      state: cloud ? 'bound' : nameConflict ? 'name-conflict' : 'local-only',
    };
  });

  for (const cloud of cloudProjects) {
    if (claimed.has(cloud.id)) continue;
    items.push({
      cloud,
      effectiveUpdatedAt: effectiveTimestamp(null, cloud),
      key: `cloud:${cloud.id}`,
      local: null,
      name: cloud.name,
      state: 'cloud-only',
    });
  }
  return items.sort(
    (left, right) =>
      right.effectiveUpdatedAt.localeCompare(left.effectiveUpdatedAt) ||
      left.key.localeCompare(right.key),
  );
}
