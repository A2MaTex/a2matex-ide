import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  parseArguments,
  platformKey as hostPlatformKey,
  platformKeyFor,
  projectRoot,
} from './runtime-resource-contract.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

const args = parseArguments(process.argv.slice(2));
for (const key of args.keys()) {
  if (!['--version', '--platform', '--output-directory'].includes(key)) {
    throw new Error(`Unsupported argument ${key}`);
  }
}
const version = args.get('--version');
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('--version must be a semantic version');
}
const platformKey = args.get('--platform') ?? hostPlatformKey;
const platformParts = platformKey.match(/^(linux|win32)-(x64)$/);
if (!platformParts || platformKeyFor(platformParts[1], platformParts[2]) !== platformKey) {
  throw new Error(`Unsupported target platform ${platformKey}`);
}

const releaseDirectory = path.resolve(
  args.get('--output-directory') ?? path.join(projectRoot, 'release'),
);
await mkdir(releaseDirectory, { recursive: true });
const sbom = await run('npm', ['sbom', '--omit=dev', '--sbom-format', 'cyclonedx']);
JSON.parse(sbom.toString('utf8'));
const prefix = `A2MaTeX-Studio-${version}-${platformKey}`;
await writeFile(path.join(releaseDirectory, `${prefix}.cdx.json`), sbom, {
  flag: 'w',
  mode: 0o644,
});
await writeFile(
  path.join(releaseDirectory, `${prefix}-runtime-dependencies.json`),
  await readFile(path.join(projectRoot, 'build', 'runtime-dependencies.json')),
  { flag: 'w', mode: 0o644 },
);
await writeFile(
  path.join(releaseDirectory, `${prefix}-Android-Platform-Tools-NOTICE.txt`),
  await readFile(
    path.join(
      projectRoot,
      'build-resources',
      'runtime',
      platformKey,
      'platform-tools',
      'NOTICE.txt',
    ),
  ),
  { flag: 'w', mode: 0o644 },
);
process.stdout.write(`${JSON.stringify({ evidencePrefix: prefix }, null, 2)}\n`);
