export const LOCAL_PROJECT_NAME_NORMALIZATION_VERSION = 1;

/**
 * Local duplicate detection only. The backend must use the same contract before
 * this value can be treated as a cloud identity constraint.
 */
export function normalizeProjectName(name: string) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** Mirrors the backend unique index: lower(btrim(name)). */
export function normalizeCloudProjectName(name: string) {
  return name.trim().toLowerCase();
}
