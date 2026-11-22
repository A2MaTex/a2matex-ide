import {
  closeSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  openSync,
} from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import {
  loadDependencies,
  parseArguments,
  platformKey,
  projectRoot,
} from './runtime-resource-contract.mjs';

function loopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a loopback port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function mkfifo() {
  for (const candidate of ['/usr/bin/mkfifo', '/bin/mkfifo']) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('mkfifo is required for the managed Runtime smoke test');
}

function readReady(stream, child) {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const finish = (error, value) => {
      clearTimeout(timer);
      stream.removeAllListeners();
      child.removeListener('exit', onExit);
      if (error) reject(error);
      else resolve(value);
    };
    const onExit = (code) => finish(new Error(`Runtime exited before readiness with ${code}`));
    const timer = setTimeout(() => finish(new Error('Runtime readiness timed out')), 10_000);
    child.once('exit', onExit);
    stream.on('error', (error) => finish(error));
    stream.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length > 4 * 1024) {
        finish(new Error('Runtime readiness record exceeded 4 KiB'));
        return;
      }
      const newline = buffered.indexOf(0x0a);
      if (newline >= 0) finish(undefined, buffered.subarray(0, newline).toString('utf8'));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Runtime did not stop after owner shutdown'));
    }, 10_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const args = parseArguments(process.argv.slice(2));
for (const key of args.keys()) {
  if (!['--owner-loss', '--root', '--stdio'].includes(key)) {
    throw new Error(`Unsupported argument ${key}`);
  }
}
const ownerLoss = args.get('--owner-loss') === 'true';
const dependencies = await loadDependencies();
const root = path.resolve(
  args.get('--root') ?? path.join(projectRoot, 'build-resources', 'runtime', platformKey),
);
const windows = process.platform === 'win32';
const stdioTransport = windows || args.get('--stdio') === 'true';
const runtimeExecutable = path.join(root, windows ? 'a2matex-runtime.exe' : 'a2matex-runtime');
const adbExecutable = path.join(root, 'platform-tools', windows ? 'adb.exe' : 'adb');
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'a2matex-managed-smoke-'));
const pipeDirectory = path.join(temporaryDirectory, 'pipes');
const stateDirectory = path.join(temporaryDirectory, 'state');
await mkdir(stateDirectory, { mode: 0o700 });
const commandPath = path.join(pipeDirectory, 'command');
const readyPath = path.join(pipeDirectory, 'ready');
if (!stdioTransport) {
  await mkdir(pipeDirectory, { mode: 0o700 });
  const created = spawnSync(mkfifo(), ['-m', '600', commandPath, readyPath], { stdio: 'ignore' });
  if (created.status !== 0) throw new Error('Could not create managed Runtime pipes');
}

let commandDummy = -1;
let readyDummy = -1;
let childCommand = -1;
let childReady = -1;
let parentCommand = -1;
let parentReady = -1;
let child;
let command;
let ready;
try {
  if (!stdioTransport) {
    commandDummy = openSync(commandPath, constants.O_RDWR);
    childCommand = openSync(commandPath, constants.O_RDONLY);
    parentCommand = openSync(commandPath, constants.O_WRONLY);
    closeSync(commandDummy);
    commandDummy = -1;
    readyDummy = openSync(readyPath, constants.O_RDWR);
    parentReady = openSync(readyPath, constants.O_RDONLY);
    childReady = openSync(readyPath, constants.O_WRONLY);
    closeSync(readyDummy);
    readyDummy = -1;
  }
  const port = await loopbackPort();
  child = spawn(
    runtimeExecutable,
    [
      ...(stdioTransport ? ['--owner-stdio'] : ['--owner-command-pipe=3', '--owner-ready-pipe=4']),
      `--listen-address=127.0.0.1:${port}`,
      '--log-level=warn',
    ],
    {
      env: {
        ...process.env,
        A2MATEX_RUNTIME_ADB_ALLOW_PATH_FALLBACK: 'false',
        A2MATEX_RUNTIME_ADB_EXECUTABLE_PATH: adbExecutable,
        LOCALAPPDATA: stateDirectory,
        XDG_STATE_HOME: stateDirectory,
      },
      shell: false,
      stdio: stdioTransport
        ? ['pipe', 'pipe', 'pipe']
        : ['ignore', 'ignore', 'pipe', childCommand, childReady],
      windowsHide: true,
    },
  );
  if (stdioTransport) {
    if (!child.stdin || !child.stdout) throw new Error('Managed Runtime stdio pipes are missing');
    command = child.stdin;
    ready = child.stdout;
  } else {
    closeSync(childCommand);
    childCommand = -1;
    closeSync(childReady);
    childReady = -1;
    command = createWriteStream(commandPath, { autoClose: true, fd: parentCommand });
    parentCommand = -1;
    ready = createReadStream(readyPath, { autoClose: true, fd: parentReady });
    parentReady = -1;
  }
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 64 * 1024) stderr += chunk;
  });
  const frame = await readReady(ready, child);
  ready.destroy();
  const session = JSON.parse(frame);
  if (
    !session ||
    typeof session.apiBaseUrl !== 'string' ||
    !session.apiBaseUrl.startsWith('http://127.0.0.1:') ||
    typeof session.sessionToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(session.sessionToken)
  ) {
    throw new Error('Runtime returned an invalid managed readiness record');
  }
  const response = await fetch(`${session.apiBaseUrl}/runtime-info`, {
    headers: { Authorization: `Bearer ${session.sessionToken}` },
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Runtime info probe failed with HTTP ${response.status}`);
  const info = await response.json();
  if (
    info.runtimeVersion !== dependencies.runtime.version ||
    !Array.isArray(info.runtimeIrFormatVersions) ||
    !dependencies.runtime.runtimeIrFormatVersions.every((version) =>
      info.runtimeIrFormatVersions.includes(version),
    )
  ) {
    throw new Error('Runtime info is incompatible with pinned Studio dependencies');
  }
  if (ownerLoss) command.destroy();
  else command.end('shutdown\n');
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) throw new Error(`Runtime shutdown exited with ${exitCode}: ${stderr.trim()}`);
  process.stdout.write(
    `${JSON.stringify({ runtimeVersion: info.runtimeVersion, state: 'STOPPED', stopReason: ownerLoss ? 'OWNER_LOSS' : 'SHUTDOWN' }, null, 2)}\n`,
  );
} finally {
  for (const descriptor of [
    commandDummy,
    readyDummy,
    childCommand,
    childReady,
    parentCommand,
    parentReady,
  ]) {
    if (descriptor < 0) continue;
    try {
      closeSync(descriptor);
    } catch {
      // Best-effort cleanup after a failed smoke test.
    }
  }
  if (child && child.exitCode === null) child.kill('SIGKILL');
  command?.destroy();
  ready?.destroy();
  await rm(temporaryDirectory, { force: true, recursive: true });
}
