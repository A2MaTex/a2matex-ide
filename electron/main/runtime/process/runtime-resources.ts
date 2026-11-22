import { createHash } from 'node:crypto';
import { accessSync, constants, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { RuntimeError } from '@application/runtime/runtime.error';

const RUNTIME_MANIFEST_KEYS = [
  'adbSha256',
  'arch',
  'platform',
  'platformToolsArchiveSha256',
  'platformToolsTreeSha256',
  'platformToolsVersion',
  'runtimeCommit',
  'runtimeIrFormatVersions',
  'runtimeSha256',
  'runtimeVersion',
  'schemaVersion',
] as const;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

export interface RuntimeResourceOptions {
  appPath: string;
  arch?: string;
  isPackaged: boolean;
  platform?: NodeJS.Platform;
  resourcesPath: string;
}

export interface ResolvedRuntimeResources {
  adbExecutable: string;
  runtimeExecutable: string;
}

interface RuntimeManifest {
  adbSha256: string;
  arch: string;
  platform: string;
  platformToolsArchiveSha256: string;
  platformToolsTreeSha256: string;
  platformToolsVersion: string;
  runtimeCommit: string;
  runtimeIrFormatVersions: number[];
  runtimeSha256: string;
  runtimeVersion: string;
  schemaVersion: 1;
}

function runtimeError(
  code: 'RUNTIME_INTEGRITY_FAILED' | 'RUNTIME_NOT_INSTALLED',
  message: string,
  cause?: unknown,
) {
  return new RuntimeError(code, message, false, cause === undefined ? undefined : { cause });
}

function assertRegularFile(filePath: string, allowedRoot?: string, executable = true) {
  try {
    const metadata = lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not a regular file');
    const resolved = realpathSync(filePath);
    if (allowedRoot) {
      const relative = path.relative(realpathSync(allowedRoot), resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('outside runtime root');
      }
    }
    accessSync(
      resolved,
      executable && process.platform !== 'win32' ? constants.X_OK : constants.F_OK,
    );
    return resolved;
  } catch (error) {
    throw runtimeError(
      'RUNTIME_NOT_INSTALLED',
      'The local Runtime installation is missing or cannot be executed.',
      error,
    );
  }
}

function parseManifest(filePath: string): RuntimeManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The local Runtime integrity manifest is missing or invalid.',
      error,
    );
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The local Runtime integrity manifest is invalid.',
    );
  }
  const manifest = value as Record<string, unknown>;
  const keys = Object.keys(manifest).sort();
  if (
    keys.length !== RUNTIME_MANIFEST_KEYS.length ||
    keys.some((key, index) => key !== [...RUNTIME_MANIFEST_KEYS].sort()[index]) ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.platform !== 'string' ||
    typeof manifest.arch !== 'string' ||
    typeof manifest.runtimeVersion !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(manifest.runtimeVersion) ||
    typeof manifest.runtimeCommit !== 'string' ||
    !COMMIT.test(manifest.runtimeCommit) ||
    typeof manifest.runtimeSha256 !== 'string' ||
    !SHA256.test(manifest.runtimeSha256) ||
    typeof manifest.adbSha256 !== 'string' ||
    !SHA256.test(manifest.adbSha256) ||
    typeof manifest.platformToolsVersion !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(manifest.platformToolsVersion) ||
    typeof manifest.platformToolsArchiveSha256 !== 'string' ||
    !SHA256.test(manifest.platformToolsArchiveSha256) ||
    typeof manifest.platformToolsTreeSha256 !== 'string' ||
    !SHA256.test(manifest.platformToolsTreeSha256) ||
    !Array.isArray(manifest.runtimeIrFormatVersions) ||
    manifest.runtimeIrFormatVersions.length === 0 ||
    manifest.runtimeIrFormatVersions.some(
      (version) => !Number.isSafeInteger(version) || Number(version) <= 0,
    )
  ) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The local Runtime integrity manifest does not match the supported contract.',
    );
  }
  return manifest as unknown as RuntimeManifest;
}

function hashFile(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function hashDirectory(directory: string) {
  try {
    const files: Array<[string, string]> = [];
    const visit = (current: string, relativeRoot: string) => {
      const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        const relative = path.posix.join(relativeRoot, entry.name);
        const metadata = lstatSync(absolute);
        if (metadata.isSymbolicLink()) throw new Error('Platform Tools contains a symlink');
        if (metadata.isDirectory()) visit(absolute, relative);
        else if (metadata.isFile()) files.push([relative, hashFile(absolute)]);
        else throw new Error('Platform Tools contains an unsupported filesystem entry');
      }
    };
    visit(directory, '');
    const hash = createHash('sha256');
    for (const [relative, fileHash] of files) hash.update(`${relative}\0${fileHash}\n`);
    return hash.digest('hex');
  } catch (error) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The installed Android tools failed their integrity check.',
      error,
    );
  }
}

function assertSameManifest(actual: RuntimeManifest, expected: RuntimeManifest) {
  for (const key of RUNTIME_MANIFEST_KEYS) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
      throw runtimeError(
        'RUNTIME_INTEGRITY_FAILED',
        'The installed Runtime manifest does not match this Studio build.',
      );
    }
  }
}

function resolvePackagedResources(
  options: RuntimeResourceOptions,
  platform: NodeJS.Platform,
  arch: string,
): ResolvedRuntimeResources {
  const root = path.join(options.resourcesPath, 'runtime', `${platform}-${arch}`);
  const executableName = platform === 'win32' ? 'a2matex-runtime.exe' : 'a2matex-runtime';
  const adbName = platform === 'win32' ? 'adb.exe' : 'adb';
  const runtimeExecutable = assertRegularFile(path.join(root, executableName), root);
  const adbExecutable = assertRegularFile(path.join(root, 'platform-tools', adbName), root);
  assertRegularFile(path.join(root, 'runtime-manifest.json'), root, false);
  const installedManifest = parseManifest(path.join(root, 'runtime-manifest.json'));
  const expectedManifest = parseManifest(
    path.join(options.appPath, 'build', 'runtime-integrity.json'),
  );
  assertSameManifest(installedManifest, expectedManifest);
  if (installedManifest.platform !== platform || installedManifest.arch !== arch) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The installed Runtime platform does not match this device.',
    );
  }
  if (hashFile(runtimeExecutable) !== installedManifest.runtimeSha256) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The installed Runtime executable failed its integrity check.',
    );
  }
  if (hashFile(adbExecutable) !== installedManifest.adbSha256) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The installed Android tools executable failed its integrity check.',
    );
  }
  if (
    hashDirectory(path.join(root, 'platform-tools')) !== installedManifest.platformToolsTreeSha256
  ) {
    throw runtimeError(
      'RUNTIME_INTEGRITY_FAILED',
      'The installed Android tools directory failed its integrity check.',
    );
  }
  return { adbExecutable, runtimeExecutable };
}

function pathExecutable(name: string) {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try {
      return assertRegularFile(candidate);
    } catch {
      // Continue to the next absolute PATH entry.
    }
  }
  throw runtimeError('RUNTIME_NOT_INSTALLED', 'ADB was not found for local development.');
}

function resolveDevelopmentAdb(
  options: RuntimeResourceOptions,
  platform: NodeJS.Platform,
  arch: string,
) {
  const override =
    process.env.A2MATEX_ADB_PATH?.trim() || process.env.A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH?.trim();
  if (override) {
    if (!path.isAbsolute(override)) {
      throw runtimeError('RUNTIME_NOT_INSTALLED', 'The ADB development override must be absolute.');
    }
    return assertRegularFile(override);
  }
  const adbName = platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    path.join(
      options.appPath,
      'build-resources',
      'runtime',
      `${platform}-${arch}`,
      'platform-tools',
      adbName,
    ),
    path.resolve(options.appPath, '..', 'a2matex-runtime', 'bin', 'platform-tools', adbName),
  ];
  for (const candidate of candidates) {
    try {
      return assertRegularFile(candidate);
    } catch {
      // The development fallback may use another staged or system installation.
    }
  }
  return pathExecutable(adbName);
}

export function resolveRuntimeResources(options: RuntimeResourceOptions): ResolvedRuntimeResources {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  if (options.isPackaged) return resolvePackagedResources(options, platform, arch);

  const override = process.env.A2MATEX_RUNTIME_EXECUTABLE?.trim();
  let runtimeExecutable: string;
  if (override) {
    if (!path.isAbsolute(override)) {
      throw runtimeError(
        'RUNTIME_NOT_INSTALLED',
        'The Runtime development override must be absolute.',
      );
    }
    runtimeExecutable = assertRegularFile(override);
  } else {
    runtimeExecutable = assertRegularFile(
      path.resolve(
        options.appPath,
        '..',
        'a2matex-runtime',
        'bin',
        platform === 'win32' ? 'a2matex-runtime.exe' : 'a2matex-runtime',
      ),
    );
  }
  return {
    adbExecutable: resolveDevelopmentAdb(options, platform, arch),
    runtimeExecutable,
  };
}
