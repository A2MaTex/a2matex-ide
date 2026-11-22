import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractFile, listPackage } from '@electron/asar';

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

function run(command, args, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} smoke check timed out`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr, stdout });
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function assertNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink())
      throw new Error(`Runtime resources contain symlink ${entryPath}`);
    if (metadata.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

function assertManifest(manifest, dependencies, targetPlatform, targetArch, targetKey) {
  const expectedKeys = [
    'schemaVersion',
    'runtimeVersion',
    'runtimeCommit',
    'platform',
    'arch',
    'runtimeSha256',
    'adbSha256',
    'platformToolsVersion',
    'platformToolsArchiveSha256',
    'platformToolsTreeSha256',
    'runtimeIrFormatVersions',
  ].sort();
  const actualKeys = Object.keys(manifest).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('Runtime manifest fields do not match schema version 1');
  }
  const expected = {
    schemaVersion: 1,
    runtimeVersion: dependencies.runtime.version,
    runtimeCommit: dependencies.runtime.commit,
    platform: targetPlatform,
    arch: targetArch,
    platformToolsVersion: dependencies.platformTools.version,
    platformToolsArchiveSha256: dependencies.platformTools[targetKey].sha256,
    runtimeIrFormatVersions: dependencies.runtime.runtimeIrFormatVersions,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(manifest[key]) !== JSON.stringify(value)) {
      throw new Error(`Runtime manifest ${key} does not match pinned dependencies`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.runtimeSha256)) {
    throw new Error('Runtime manifest runtimeSha256 is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.adbSha256)) {
    throw new Error('Runtime manifest adbSha256 is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.platformToolsTreeSha256)) {
    throw new Error('Runtime manifest platformToolsTreeSha256 is invalid');
  }
}

function assertPackagedAnchor(appAsar, manifest) {
  let anchor;
  try {
    anchor = JSON.parse(extractFile(appAsar, 'build/runtime-integrity.json').toString('utf8'));
  } catch (error) {
    throw new Error(`Packaged Runtime integrity anchor is missing or invalid: ${error.message}`);
  }
  if (JSON.stringify(anchor) !== JSON.stringify(manifest)) {
    throw new Error('Packaged Runtime integrity anchor does not match installed resources');
  }
  const packagedExecutables = listPackage(appAsar).filter((entry) =>
    /^\/(?:build-resources\/)?runtime\/.+\/(?:a2matex-runtime(?:\.exe)?|platform-tools\/adb(?:\.exe)?)$/.test(
      entry,
    ),
  );
  if (packagedExecutables.length > 0) {
    throw new Error(
      `Runtime executables must remain outside ASAR: ${packagedExecutables.join(', ')}`,
    );
  }
}

const args = parseArguments(process.argv.slice(2));
for (const key of args.keys()) {
  if (!['--app-asar', '--root', '--smoke', '--platform'].includes(key)) {
    throw new Error(`Unsupported argument ${key}`);
  }
}
const targetKey = args.get('--platform') ?? hostPlatformKey;
const targetParts = targetKey.match(/^(linux|win32)-(x64)$/);
if (!targetParts || platformKeyFor(targetParts[1], targetParts[2]) !== targetKey) {
  throw new Error(`Unsupported target platform ${targetKey}`);
}
const targetPlatform = targetParts[1];
const targetArch = targetParts[2];
const root = path.resolve(
  args.get('--root') ?? path.join(projectRoot, 'build-resources', 'runtime', targetKey),
);
const smoke = args.get('--smoke') === 'true';
if (smoke && (targetPlatform !== process.platform || targetArch !== process.arch)) {
  throw new Error(`Cannot run ${targetKey} Runtime smoke checks on ${hostPlatformKey}.`);
}
const dependencies = await loadDependencies();
await assertNoSymlinks(root);
const runtimeName = targetPlatform === 'win32' ? 'a2matex-runtime.exe' : 'a2matex-runtime';
const adbName = targetPlatform === 'win32' ? 'adb.exe' : 'adb';
const runtimeExecutable = path.join(root, runtimeName);
const adbExecutable = path.join(root, 'platform-tools', adbName);
await assertRegularFile(runtimeExecutable, { executable: targetPlatform !== 'win32' });
await assertRegularFile(adbExecutable, { executable: targetPlatform !== 'win32' });
await assertRegularFile(path.join(root, 'platform-tools', 'NOTICE.txt'));
await assertRegularFile(path.join(root, 'platform-tools', 'source.properties'));
if (targetPlatform === 'win32') {
  await assertRegularFile(path.join(root, 'platform-tools', 'AdbWinApi.dll'));
  await assertRegularFile(path.join(root, 'platform-tools', 'AdbWinUsbApi.dll'));
}
const manifest = JSON.parse(await readFile(path.join(root, 'runtime-manifest.json'), 'utf8'));
assertManifest(manifest, dependencies, targetPlatform, targetArch, targetKey);
const appAsar = args.get('--app-asar');
if (appAsar) {
  const resolvedAppAsar = path.resolve(appAsar);
  await assertRegularFile(resolvedAppAsar);
  assertPackagedAnchor(resolvedAppAsar, manifest);
}
const actualRuntimeSha256 = await sha256(runtimeExecutable);
if (actualRuntimeSha256 !== manifest.runtimeSha256) {
  throw new Error(
    `Runtime executable checksum mismatch: expected ${manifest.runtimeSha256}, got ${actualRuntimeSha256}`,
  );
}
const actualAdbSha256 = await sha256(adbExecutable);
if (actualAdbSha256 !== manifest.adbSha256) {
  throw new Error(
    `ADB executable checksum mismatch: expected ${manifest.adbSha256}, got ${actualAdbSha256}`,
  );
}
const actualPlatformToolsTreeSha256 = await sha256Directory(path.join(root, 'platform-tools'));
if (actualPlatformToolsTreeSha256 !== manifest.platformToolsTreeSha256) {
  throw new Error(
    `Platform Tools tree checksum mismatch: expected ${manifest.platformToolsTreeSha256}, got ${actualPlatformToolsTreeSha256}`,
  );
}
const properties = await readFile(path.join(root, 'platform-tools', 'source.properties'), 'utf8');
if (!properties.split(/\r?\n/).includes(`Pkg.Revision=${dependencies.platformTools.version}`)) {
  throw new Error('Bundled Platform Tools version does not match pinned dependencies');
}
if (smoke) {
  await run(runtimeExecutable, ['--help']);
  const adbVersion = await run(adbExecutable, ['version']);
  if (!adbVersion.stdout.includes(`Version ${dependencies.platformTools.version}-`)) {
    throw new Error('Bundled ADB version output does not match pinned Platform Tools version');
  }
}
process.stdout.write(
  `${JSON.stringify({ adbSha256: actualAdbSha256, appAsar: appAsar ? path.resolve(appAsar) : null, platformToolsTreeSha256: actualPlatformToolsTreeSha256, root, runtimeSha256: actualRuntimeSha256, smoke }, null, 2)}\n`,
);
