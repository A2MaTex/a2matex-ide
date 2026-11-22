import {
  closeSync,
  constants,
  createReadStream,
  createWriteStream,
  chmodSync,
  existsSync,
  mkdtempSync,
  openSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import { RuntimeError } from '@application/runtime/runtime.error';

export interface RuntimePipes {
  childCommandFd: number;
  childReadyFd: number;
  closeChildEnds(): void;
  command: Writable;
  ready: Readable;
}

function safeClose(fd: number) {
  try {
    closeSync(fd);
  } catch {
    // A failed spawn path may already have closed or transferred this descriptor.
  }
}

function resolveMkfifo() {
  for (const candidate of ['/usr/bin/mkfifo', '/bin/mkfifo']) {
    if (existsSync(candidate)) return candidate;
  }
  throw new RuntimeError(
    'RUNTIME_PLATFORM_UNSUPPORTED',
    'This system does not provide the managed Runtime pipe primitive.',
    false,
  );
}

/**
 * Node's `stdio: "pipe"` is a socketpair on Unix, while Runtime deliberately
 * requires OS pipes. Private FIFOs give each process only its directional end
 * and preserve fail-closed EOF when Studio exits.
 */
export function createRuntimePipes(): RuntimePipes {
  if (process.platform === 'win32') {
    throw new RuntimeError(
      'RUNTIME_PLATFORM_UNSUPPORTED',
      'Managed Runtime pipes have not yet been verified for Windows.',
      false,
    );
  }

  const directory = mkdtempSync(path.join(os.tmpdir(), 'a2matex-runtime-'));
  chmodSync(directory, 0o700);
  const commandPath = path.join(directory, 'command');
  const readyPath = path.join(directory, 'ready');
  const created = spawnSync(resolveMkfifo(), ['-m', '600', commandPath, readyPath], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (created.status !== 0) {
    rmSync(directory, { recursive: true, force: true });
    throw new RuntimeError(
      'RUNTIME_START_FAILED',
      'The managed Runtime pipes could not be created.',
      true,
    );
  }

  let commandDummy = -1;
  let readyDummy = -1;
  let childCommandFd = -1;
  let childReadyFd = -1;
  let parentCommandFd = -1;
  let parentReadyFd = -1;
  try {
    // The temporary read/write descriptors prevent the directional opens from blocking.
    commandDummy = openSync(commandPath, constants.O_RDWR);
    childCommandFd = openSync(commandPath, constants.O_RDONLY);
    parentCommandFd = openSync(commandPath, constants.O_WRONLY);
    safeClose(commandDummy);
    commandDummy = -1;

    readyDummy = openSync(readyPath, constants.O_RDWR);
    parentReadyFd = openSync(readyPath, constants.O_RDONLY);
    childReadyFd = openSync(readyPath, constants.O_WRONLY);
    safeClose(readyDummy);
    readyDummy = -1;

    // Open descriptors remain valid after unlink and no other process can discover the pipes.
    rmSync(directory, { recursive: true, force: true });
    let childEndsClosed = false;
    return {
      childCommandFd,
      childReadyFd,
      command: createWriteStream(commandPath, { fd: parentCommandFd, autoClose: true }),
      ready: createReadStream(readyPath, { fd: parentReadyFd, autoClose: true }),
      closeChildEnds: () => {
        if (childEndsClosed) return;
        childEndsClosed = true;
        safeClose(childCommandFd);
        safeClose(childReadyFd);
      },
    };
  } catch (error) {
    for (const fd of [
      commandDummy,
      readyDummy,
      childCommandFd,
      childReadyFd,
      parentCommandFd,
      parentReadyFd,
    ]) {
      if (fd >= 0) safeClose(fd);
    }
    rmSync(directory, { recursive: true, force: true });
    throw new RuntimeError(
      'RUNTIME_START_FAILED',
      'The managed Runtime pipes could not be opened.',
      true,
      { cause: error },
    );
  }
}
