import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const projectRoot = path.resolve(import.meta.dirname, '..');
export const dependencyFile = path.join(projectRoot, 'build', 'runtime-dependencies.json');
export const supportedPlatformKeys = ['linux-x64', 'win32-x64'];

export function platformKeyFor(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  if (!supportedPlatformKeys.includes(key)) fail(`unsupported platform ${key}`);
  return key;
}

export const platformKey = platformKeyFor();

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function fail(message) {
  throw new Error(`Runtime resource contract: ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object')
    fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} fields do not match the supported schema`);
  }
}

export async function loadDependencies() {
  const parsed = JSON.parse(await readFile(dependencyFile, 'utf8'));
  exactKeys(parsed, ['schemaVersion', 'runtime', 'platformTools'], 'dependency document');
  if (parsed.schemaVersion !== 1) fail('unsupported dependency schemaVersion');
  exactKeys(
    parsed.runtime,
    ['version', 'repository', 'commit', 'buildTime', 'runtimeIrFormatVersions'],
    'runtime dependency',
  );
  if (!/^\d+\.\d+\.\d+$/.test(parsed.runtime.version)) fail('runtime.version must be semver');
  if (!COMMIT.test(parsed.runtime.commit)) fail('runtime.commit must be a full lowercase Git SHA');
  if (Number.isNaN(Date.parse(parsed.runtime.buildTime)))
    fail('runtime.buildTime must be ISO-8601');
  if (
    !Array.isArray(parsed.runtime.runtimeIrFormatVersions) ||
    parsed.runtime.runtimeIrFormatVersions.length === 0 ||
    parsed.runtime.runtimeIrFormatVersions.some(
      (version) => !Number.isSafeInteger(version) || version <= 0,
    )
  ) {
    fail('runtime.runtimeIrFormatVersions must contain positive integers');
  }
  exactKeys(
    parsed.platformTools,
    ['version', 'licenseUrl', ...supportedPlatformKeys],
    'platformTools dependency',
  );
  if (!/^\d+\.\d+\.\d+$/.test(parsed.platformTools.version)) {
    fail('platformTools.version must be semver');
  }
  for (const key of supportedPlatformKeys) {
    const platformTools = parsed.platformTools[key];
    exactKeys(platformTools, ['url', 'sha256'], `${key} Platform Tools dependency`);
    const url = new URL(platformTools.url);
    if (url.protocol !== 'https:' || url.hostname !== 'dl.google.com') {
      fail('Platform Tools URL must use the approved dl.google.com HTTPS origin');
    }
    if (!SHA256.test(platformTools.sha256)) {
      fail(`${key} Platform Tools SHA-256 is invalid`);
    }
  }
  return parsed;
}

export async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function sha256Directory(directory) {
  const entries = [];
  async function visit(current, relativeRoot) {
    const children = await readdir(current, { withFileTypes: true });
    children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const child of children) {
      const absolute = path.join(current, child.name);
      const relative = path.posix.join(relativeRoot, child.name);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) fail(`${absolute} must not be a symlink`);
      if (metadata.isDirectory()) await visit(absolute, relative);
      else if (metadata.isFile()) entries.push([relative, await sha256(absolute)]);
      else fail(`${absolute} must be a regular file or directory`);
    }
  }
  await visit(directory, '');
  const hash = createHash('sha256');
  for (const [relative, fileHash] of entries) hash.update(`${relative}\0${fileHash}\n`);
  return hash.digest('hex');
}

export async function assertRegularFile(filePath, options = {}) {
  const metadata = await lstat(filePath).catch(() => null);
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`${filePath} must be a regular non-symlink file`);
  }
  if (options.executable && process.platform !== 'win32' && (metadata.mode & 0o111) === 0) {
    fail(`${filePath} must be executable`);
  }
  return metadata;
}

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      fail(`invalid argument ${key}`);
    }
    if (values.has(key)) fail(`duplicate argument ${key}`);
    values.set(key, argv[index + 1]);
    index += 1;
  }
  return values;
}
