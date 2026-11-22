import { accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { RuntimeError } from '@application/runtime/runtime.error';

export interface RuntimeExecutableOptions {
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}

function assertExecutable(filePath: string, allowedRoot?: string) {
  try {
    const metadata = lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not a regular file');
    const resolved = realpathSync(filePath);
    if (allowedRoot) {
      const relative = path.relative(realpathSync(allowedRoot), resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('outside runtime root');
    }
    accessSync(resolved, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return resolved;
  } catch (error) {
    throw new RuntimeError(
      'RUNTIME_NOT_INSTALLED',
      'The local Runtime executable is missing or cannot be executed.',
      false,
      { cause: error },
    );
  }
}

export function resolveRuntimeExecutable(options: RuntimeExecutableOptions) {
  if (process.platform === 'win32') {
    throw new RuntimeError(
      'RUNTIME_PLATFORM_UNSUPPORTED',
      'Managed Runtime pipes have not yet been verified for Windows.',
      false,
    );
  }

  const override = process.env.A2MATEX_RUNTIME_EXECUTABLE;
  if (override) {
    if (!path.isAbsolute(override)) {
      throw new RuntimeError(
        'RUNTIME_NOT_INSTALLED',
        'A2MATEX_RUNTIME_EXECUTABLE must be an absolute path.',
        false,
      );
    }
    return assertExecutable(override);
  }

  const executableName = 'a2matex-runtime';
  if (options.isPackaged) {
    const runtimeRoot = path.join(
      options.resourcesPath,
      'runtime',
      `${process.platform}-${process.arch}`,
    );
    return assertExecutable(path.join(runtimeRoot, executableName), runtimeRoot);
  }

  return assertExecutable(
    path.resolve(options.appPath, '..', 'a2matex-runtime', 'bin', executableName),
  );
}
