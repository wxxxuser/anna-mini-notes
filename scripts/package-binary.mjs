import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec as pkg } from '@yao-pkg/pkg';
import { smokeBinary } from './smoke-binary.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(root, 'releases');
const manifest = JSON.parse(await readFile(path.join(root, 'executas/mini-notes/manifest.json'), 'utf8'));
const targets = {
  'darwin-arm64': { key: 'darwin-arm64', pkg: 'node24-macos-arm64', extension: '.tar.gz' },
  'darwin-x64': { key: 'darwin-x86_64', pkg: 'node24-macos-x64', extension: '.tar.gz' },
  'win32-x64': { key: 'windows-x86_64', pkg: 'node24-win-x64', extension: '.zip' },
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error(`Unsupported host ${process.platform}-${process.arch}; use macOS arm64/x64 or Windows x64.`);
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(manifest.version)) throw new Error('Manifest version must be a safe SemVer string');
if (process.env.EXPECTED_PLATFORM && process.env.EXPECTED_PLATFORM !== target.key) {
  throw new Error(`Runner architecture mismatch: expected ${process.env.EXPECTED_PLATFORM}, detected ${target.key}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function checkedBuildPath(candidate) {
  const absolute = path.resolve(candidate);
  const relative = path.relative(outputRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(absolute).startsWith('.build-')) {
    throw new Error(`Refusing to remove a path outside the package staging area: ${absolute}`);
  }
  return absolute;
}

await mkdir(outputRoot, { recursive: true });
const buildRoot = await mkdtemp(path.join(outputRoot, `.build-${target.key}-`));
const stage = path.join(buildRoot, 'stage');
const unpacked = path.join(buildRoot, 'unpacked');
const entrypoint = process.platform === 'win32' ? 'bin/mini-notes-tool.exe' : 'bin/mini-notes-tool';
const binary = path.join(stage, entrypoint);
const archiveName = `mini-notes-${manifest.version}-${target.key}${target.extension}`;
const archive = path.join(outputRoot, archiveName);
const pendingArchive = path.join(buildRoot, archiveName);

try {
  await mkdir(path.dirname(binary), { recursive: true });
  await mkdir(unpacked, { recursive: true });
  // pkg embeds Node and statically follows require('./manifest.json'). There
  // is no external interpreter or source tree in the release archive.
  // Plain embedded source avoids architecture-specific V8 bytecode issues.
  await pkg([
    path.join(root, 'executas/mini-notes/index.cjs'),
    '--target', target.pkg, '--output', binary,
    '--no-bytecode', '--public', '--public-packages', '*',
  ]);
  if (process.platform !== 'win32') await chmod(binary, 0o755);
  await smokeBinary(binary, manifest);

  const archiveManifest = {
    ...manifest,
    runtime: {
      binary: {
        entrypoint,
        permissions: { [entrypoint]: '0o755' },
      },
    },
  };
  await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(archiveManifest, null, 2)}\n`);
  // Windows 10/11 and GitHub Windows runners ship bsdtar. Choosing it by
  // absolute path avoids Git Bash's GNU tar, which cannot create ZIP files.
  const tar = process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  await run(tar, process.platform === 'win32'
    ? ['-a', '-cf', pendingArchive, '-C', stage, 'manifest.json', 'bin']
    : ['-czf', pendingArchive, '-C', stage, 'manifest.json', 'bin']);
  await run(tar, ['-xf', pendingArchive, '-C', unpacked]);
  const actual = JSON.parse(await readFile(path.join(unpacked, 'manifest.json'), 'utf8'));
  assert.equal(actual.name, manifest.name);
  assert.equal(actual.version, manifest.version);
  assert.equal(actual.runtime.binary.entrypoint, entrypoint);
  assert.equal(actual.runtime.binary.permissions[entrypoint], '0o755');
  assert.deepEqual((await readdir(unpacked)).sort(), ['bin', 'manifest.json']);
  assert.deepEqual(await readdir(path.join(unpacked, 'bin')), [path.basename(entrypoint)]);
  if (process.platform !== 'win32') {
    assert((await stat(path.join(unpacked, entrypoint))).mode & 0o111, 'Archive must preserve executable permission');
  }
  await smokeBinary(path.join(unpacked, entrypoint), actual);
  const bytes = await readFile(pendingArchive);
  // Publish the local output only after extraction and both smoke tests pass.
  await rename(pendingArchive, archive);
  console.log(`Packaged ${target.key}: ${archive}`);
  console.log(`Archive root verified; size=${bytes.length}; sha256=${createHash('sha256').update(bytes).digest('hex')}`);
} finally {
  // Only remove the unique staging directory created by this invocation.
  await rm(checkedBuildPath(buildRoot), { recursive: true, force: true });
}
