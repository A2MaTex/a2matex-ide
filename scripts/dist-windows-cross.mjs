import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { projectRoot } from './runtime-resource-contract.mjs';

const outputDirectory = 'release-win';
const outputPath = path.join(projectRoot, outputDirectory);

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? 'no exit code'}`));
    });
  });
}

try {
  await access(outputPath);
  throw new Error(
    `${outputDirectory} already exists. Move or rename it before starting a fresh cross-build.`,
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

await run(process.execPath, [
  'scripts/prepare-runtime-resources.mjs',
  '--target-platform',
  'win32-x64',
  '--cross-target',
  'true',
]);
await run(process.execPath, ['scripts/verify-runtime-resources.mjs', '--platform', 'win32-x64']);
await run(npm, ['run', 'build:desktop']);
await run(npx, [
  'electron-builder',
  '--win',
  'nsis',
  '--x64',
  '--publish',
  'never',
  `-c.directories.output=${outputDirectory}`,
]);
await run(process.execPath, [
  'scripts/verify-runtime-resources.mjs',
  '--platform',
  'win32-x64',
  '--root',
  path.join(outputDirectory, 'win-unpacked', 'resources', 'runtime', 'win32-x64'),
  '--app-asar',
  path.join(outputDirectory, 'win-unpacked', 'resources', 'app.asar'),
]);
await run(process.execPath, [
  'scripts/generate-release-evidence.mjs',
  '--version',
  packageJson.version,
  '--platform',
  'win32-x64',
  '--output-directory',
  outputDirectory,
]);

process.stdout.write(`Windows installer and release evidence are in ${outputPath}\n`);
