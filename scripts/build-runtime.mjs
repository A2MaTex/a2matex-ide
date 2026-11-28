import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.resolve(
  process.env.A2MATEX_RUNTIME_SOURCE ?? path.join(studioRoot, '..', 'a2matex-runtime'),
);
const version = process.env.A2MATEX_RUNTIME_VERSION ?? '0.1.0';
const buildTime = new Date().toISOString();

const git = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
  cwd: runtimeRoot,
  encoding: 'utf8',
});
const gitStatus = spawnSync('git', ['status', '--porcelain'], {
  cwd: runtimeRoot,
  encoding: 'utf8',
});
const commit =
  git.status === 0
    ? `${git.stdout.trim()}${gitStatus.status === 0 && gitStatus.stdout.trim() ? '-dirty' : ''}`
    : 'unknown';
const ldflags = [
  '-s',
  '-w',
  `-X github.com/A2MaTex/a2matex-runtime/internal/buildinfo.Version=${version}`,
  `-X github.com/A2MaTex/a2matex-runtime/internal/buildinfo.Commit=${commit}`,
  `-X github.com/A2MaTex/a2matex-runtime/internal/buildinfo.BuildTime=${buildTime}`,
].join(' ');

const targets = [
  { goos: 'linux', directory: 'linux-x64', executable: 'a2matex-runtime' },
  { goos: 'windows', directory: 'win32-x64', executable: 'a2matex-runtime.exe' },
];

for (const target of targets) {
  const outputDirectory = path.join(studioRoot, 'resources', 'runtime', target.directory);
  const output = path.join(outputDirectory, target.executable);
  mkdirSync(outputDirectory, { recursive: true });
  const result = spawnSync(
    'go',
    ['build', '-buildvcs=false', '-trimpath', '-ldflags', ldflags, '-o', output, './cmd/agent'],
    {
      cwd: runtimeRoot,
      env: {
        ...process.env,
        CGO_ENABLED: '0',
        GOARCH: 'amd64',
        GOOS: target.goos,
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Runtime build failed for ${target.goos}/amd64 with exit code ${result.status}`,
    );
  }
  if (target.goos !== 'windows') chmodSync(output, 0o755);
}
