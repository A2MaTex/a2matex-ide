import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseArguments, platformKey, projectRoot } from './runtime-resource-contract.mjs';

const args = parseArguments(process.argv.slice(2));
for (const key of args.keys()) {
  if (key !== '--root') throw new Error(`Unsupported argument ${key}`);
}

const root = path.resolve(
  args.get('--root') ?? path.join(projectRoot, 'build-resources', 'runtime', platformKey),
);
const windows = process.platform === 'win32';
const runtimeExecutable = path.join(root, windows ? 'a2matex-runtime.exe' : 'a2matex-runtime');
const adbExecutable = path.join(root, 'platform-tools', windows ? 'adb.exe' : 'adb');
const stateDirectory = await mkdtemp(path.join(tmpdir(), 'a2matex-manager-smoke-'));
process.env.XDG_STATE_HOME = stateDirectory;
process.env.LOCALAPPDATA = stateDirectory;

const managerModule = await import(
  pathToFileURL(
    path.join(
      projectRoot,
      'dist-electron',
      'electron',
      'main',
      'runtime',
      'process',
      'runtime-process-manager.js',
    ),
  ).href
);
const manager = new managerModule.RuntimeProcessManager({
  resolveAdbExecutable: () => adbExecutable,
  resolveExecutable: () => runtimeExecutable,
});
const states = [manager.getStatus().state];
manager.onStatusChanged((status) => states.push(status.state));

try {
  await manager.ensureReady();
  if (manager.getStatus().state !== 'READY') {
    throw new Error(`Runtime manager did not become READY: ${manager.getStatus().state}`);
  }
  await manager.shutdown();
  if (manager.getStatus().state !== 'STOPPED') {
    throw new Error(`Runtime manager did not become STOPPED: ${manager.getStatus().state}`);
  }
  const expected = ['STOPPED', 'STARTING', 'READY', 'STOPPING', 'STOPPED'];
  if (JSON.stringify(states) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected Runtime manager states: ${states.join(' -> ')}`);
  }
  process.stdout.write(`${JSON.stringify({ states }, null, 2)}\n`);
} finally {
  if (manager.getStatus().state !== 'STOPPED') await manager.shutdown().catch(() => undefined);
  await rm(stateDirectory, { force: true, recursive: true });
}
