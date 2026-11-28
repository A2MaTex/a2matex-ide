import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executableName = process.platform === 'win32' ? 'a2matex-runtime.exe' : 'a2matex-runtime';
const executable = path.join(
  studioRoot,
  'resources',
  'runtime',
  `${process.platform}-${process.arch}`,
  executableName,
);

accessSync(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
const { RuntimeProcessManager } =
  await import('../dist-electron/electron/main/runtime/process/runtime-process-manager.js');
const manager = new RuntimeProcessManager({ resolveExecutable: () => executable });
const timeout = setTimeout(() => {
  process.stderr.write('Managed Runtime smoke test timed out.\n');
  process.exit(1);
}, 20_000);

try {
  await manager.ensureReady();
  const status = manager.getStatus();
  if (status.state !== 'READY') {
    throw new Error(`Expected READY Runtime status, received ${status.state}`);
  }
  process.stdout.write(
    `Managed Runtime ${status.runtimeVersion} is ready on ${process.platform}.\n`,
  );
} finally {
  await manager.shutdown();
  clearTimeout(timeout);
}
