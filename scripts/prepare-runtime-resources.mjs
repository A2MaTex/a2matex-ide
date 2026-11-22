import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import yauzl from 'yauzl';

import {
  assertRegularFile,
  loadDependencies,
  parseArguments,
  platformKey as hostPlatformKey,
  platformKeyFor,
  projectRoot,
  sha256,
  sha256Directory,
} from './runtime-resource-contract.mjs';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => (stdout += chunk));
    child.stderr?.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body)
    throw new Error(`Download failed with HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
}

const MAX_ARCHIVE_ENTRIES = 2_048;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

function safeArchiveEntry(entry, destination, seen) {
  const normalized = entry.fileName;
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    normalized.split('/').includes('..') ||
    !normalized.startsWith('platform-tools/')
  ) {
    throw new Error(`Unsafe Platform Tools archive entry: ${entry.fileName}`);
  }
  if (seen.has(normalized)) throw new Error(`Duplicate archive entry: ${normalized}`);
  seen.add(normalized);
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const fileType = unixMode & 0o170000;
  const directory = normalized.endsWith('/');
  const supportedType = directory
    ? fileType === 0 || fileType === 0o040000
    : fileType === 0 || fileType === 0o100000;
  if (!supportedType) {
    throw new Error(`Unsupported archive entry type: ${normalized}`);
  }
  if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
    throw new Error(`Encrypted archive entry is not supported: ${normalized}`);
  }
  const output = path.resolve(destination, ...normalized.split('/').filter(Boolean));
  const relative = path.relative(destination, output);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Archive entry escapes extraction root: ${normalized}`);
  }
  return { directory, mode: unixMode & 0o777, output };
}

function extractZipSafely(archive, destination) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      archive,
      { autoClose: true, decodeStrings: true, lazyEntries: true, validateEntrySizes: true },
      (openError, zip) => {
        if (openError || !zip) {
          reject(openError ?? new Error('Could not open Platform Tools archive'));
          return;
        }
        let count = 0;
        let totalSize = 0;
        let settled = false;
        const seen = new Set();
        const fail = (error) => {
          if (settled) return;
          settled = true;
          zip.close();
          reject(error);
        };
        zip.once('error', fail);
        zip.once('end', () => {
          if (settled) return;
          settled = true;
          resolve();
        });
        zip.on('entry', (entry) => {
          void (async () => {
            count += 1;
            totalSize += entry.uncompressedSize;
            if (count > MAX_ARCHIVE_ENTRIES || totalSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
              throw new Error('Platform Tools archive exceeds extraction limits');
            }
            const target = safeArchiveEntry(entry, destination, seen);
            if (target.directory) {
              await mkdir(target.output, { mode: target.mode || 0o755, recursive: true });
              zip.readEntry();
              return;
            }
            await mkdir(path.dirname(target.output), { mode: 0o755, recursive: true });
            const source = await new Promise((streamResolve, streamReject) => {
              zip.openReadStream(entry, (streamError, stream) => {
                if (streamError || !stream) {
                  streamReject(streamError ?? new Error(`Could not read ${entry.fileName}`));
                } else streamResolve(stream);
              });
            });
            await pipeline(
              source,
              createWriteStream(target.output, { flags: 'wx', mode: target.mode || 0o644 }),
            );
            zip.readEntry();
          })().catch(fail);
        });
        zip.readEntry();
      },
    );
  });
}

async function resolveRuntimeBinary(args, dependencies, targetPlatform) {
  const supplied = args.get('--runtime');
  const runtimeRepository = path.resolve(
    args.get('--runtime-repository') ?? path.join(projectRoot, '..', 'a2matex-runtime'),
  );
  const executable = path.resolve(
    supplied ??
      path.join(
        runtimeRepository,
        'bin',
        targetPlatform === 'win32' ? 'a2matex-runtime.exe' : 'a2matex-runtime',
      ),
  );
  await assertRegularFile(executable, { executable: true });

  const commit = (
    await run('git', ['rev-parse', 'HEAD'], { cwd: runtimeRepository, capture: true })
  ).trim();
  if (commit !== dependencies.runtime.commit) {
    throw new Error(
      `Runtime repository is at ${commit}; expected pinned commit ${dependencies.runtime.commit}`,
    );
  }
  return { commit, executable };
}

async function sourcePlatformToolsArchive(args, dependencies, temporaryDirectory, targetKey) {
  const supplied =
    args.get('--platform-tools-archive') ?? process.env.A2MATEX_PLATFORM_TOOLS_ARCHIVE?.trim();
  const archive = supplied
    ? path.resolve(supplied)
    : path.join(temporaryDirectory, 'platform-tools.zip');
  if (supplied) {
    await assertRegularFile(archive);
  } else {
    if (process.env.A2MATEX_ANDROID_SDK_LICENSE_ACCEPTED !== '1') {
      throw new Error(
        'Set A2MATEX_ANDROID_SDK_LICENSE_ACCEPTED=1 only after the project owner accepts the Android SDK license, or supply --platform-tools-archive.',
      );
    }
    await download(dependencies.platformTools[targetKey].url, archive);
  }
  const actualHash = await sha256(archive);
  const expectedHash = dependencies.platformTools[targetKey].sha256;
  if (actualHash !== expectedHash) {
    throw new Error(
      `Platform Tools checksum mismatch: expected ${expectedHash}, got ${actualHash}`,
    );
  }
  return { archive, archiveSha256: actualHash };
}

async function extractPlatformTools(archive, destination, expectedVersion, targetPlatform) {
  await extractZipSafely(archive, destination);
  const platformTools = path.join(destination, 'platform-tools');
  const properties = await readFile(path.join(platformTools, 'source.properties'), 'utf8');
  const revision = properties.match(/^Pkg\.Revision=(.+)$/m)?.[1]?.trim();
  if (revision !== expectedVersion) {
    throw new Error(
      `Platform Tools revision ${revision ?? 'missing'} does not match ${expectedVersion}`,
    );
  }
  const adbName = targetPlatform === 'win32' ? 'adb.exe' : 'adb';
  await assertRegularFile(path.join(platformTools, adbName), {
    executable: targetPlatform !== 'win32',
  });
  return platformTools;
}

const args = parseArguments(process.argv.slice(2));
const supported = new Set([
  '--runtime',
  '--runtime-repository',
  '--platform-tools-archive',
  '--require-platform',
  '--target-platform',
  '--cross-target',
]);
for (const key of args.keys()) {
  if (!supported.has(key)) throw new Error(`Unsupported argument ${key}`);
}
const requiredPlatform = args.get('--require-platform');
if (requiredPlatform && requiredPlatform !== hostPlatformKey) {
  throw new Error(
    `This build requires ${requiredPlatform}, but the current Node process is ${hostPlatformKey}. Run it on a native ${requiredPlatform} host.`,
  );
}
const targetKey = args.get('--target-platform') ?? hostPlatformKey;
const targetParts = targetKey.match(/^(linux|win32)-(x64)$/);
if (!targetParts || platformKeyFor(targetParts[1], targetParts[2]) !== targetKey) {
  throw new Error(`Unsupported target platform ${targetKey}`);
}
if (targetKey !== hostPlatformKey && args.get('--cross-target') !== 'true') {
  throw new Error(`Cross-target staging for ${targetKey} requires --cross-target true.`);
}
const targetPlatform = targetParts[1];
const targetArch = targetParts[2];

const dependencies = await loadDependencies();
const runtime = await resolveRuntimeBinary(args, dependencies, targetPlatform);
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'a2matex-runtime-resources-'));
const extractionDirectory = path.join(temporaryDirectory, 'extract');
await mkdir(extractionDirectory, { recursive: true });

try {
  const platformToolsArchive = await sourcePlatformToolsArchive(
    args,
    dependencies,
    temporaryDirectory,
    targetKey,
  );
  const extractedPlatformTools = await extractPlatformTools(
    platformToolsArchive.archive,
    extractionDirectory,
    dependencies.platformTools.version,
    targetPlatform,
  );
  const runtimeRoot = path.join(projectRoot, 'build-resources', 'runtime');
  const target = path.join(runtimeRoot, targetKey);
  const staging = path.join(runtimeRoot, `.${targetKey}-${randomUUID()}`);
  const runtimeName = targetPlatform === 'win32' ? 'a2matex-runtime.exe' : 'a2matex-runtime';
  const adbName = targetPlatform === 'win32' ? 'adb.exe' : 'adb';
  await mkdir(staging, { recursive: true });
  await cp(runtime.executable, path.join(staging, runtimeName), {
    dereference: false,
    errorOnExist: true,
  });
  if (targetPlatform !== 'win32') await chmod(path.join(staging, runtimeName), 0o755);
  await cp(extractedPlatformTools, path.join(staging, 'platform-tools'), {
    dereference: false,
    errorOnExist: true,
    recursive: true,
  });
  if (targetPlatform !== 'win32') {
    await chmod(path.join(staging, 'platform-tools', adbName), 0o755);
  }
  const runtimeSha256 = await sha256(path.join(staging, runtimeName));
  const adbSha256 = await sha256(path.join(staging, 'platform-tools', adbName));
  const platformToolsTreeSha256 = await sha256Directory(path.join(staging, 'platform-tools'));
  const manifest = {
    schemaVersion: 1,
    runtimeVersion: dependencies.runtime.version,
    runtimeCommit: runtime.commit,
    platform: targetPlatform,
    arch: targetArch,
    runtimeSha256,
    adbSha256,
    platformToolsVersion: dependencies.platformTools.version,
    platformToolsArchiveSha256: platformToolsArchive.archiveSha256,
    platformToolsTreeSha256,
    runtimeIrFormatVersions: dependencies.runtime.runtimeIrFormatVersions,
  };
  await writeFile(
    path.join(staging, 'runtime-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o644 },
  );
  await writeFile(
    path.join(projectRoot, 'build', 'runtime-integrity.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o644 },
  );
  await mkdir(runtimeRoot, { recursive: true });
  await rm(target, { force: true, recursive: true });
  await rename(staging, target);
  process.stdout.write(
    `${JSON.stringify({ adbSha256, platform: targetKey, platformToolsTreeSha256, runtimeSha256, target }, null, 2)}\n`,
  );
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
