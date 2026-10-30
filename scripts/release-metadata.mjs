import assert from 'node:assert/strict';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'executas/mini-notes/manifest.json'), 'utf8'));
const appPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const appMetadata = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
assert.equal(appPackage.version, manifest.version, 'App and Executa release versions must agree');
assert.equal(appMetadata.version, manifest.version, 'App metadata and Executa release versions must agree');
const tag = `v${manifest.version}`;
if (process.env.GITHUB_EVENT_NAME === 'push') {
  assert.equal(process.env.GITHUB_REF, `refs/tags/${tag}`, 'Release tag must match package and Executa version');
}
if (process.argv.includes('--check-assets')) {
  const expected = [
    `mini-notes-${manifest.version}-darwin-arm64.tar.gz`,
    `mini-notes-${manifest.version}-darwin-x86_64.tar.gz`,
    `mini-notes-${manifest.version}-windows-x86_64.zip`,
  ].sort();
  const actual = (await readdir(path.join(root, 'releases'))).sort();
  assert.deepEqual(actual, expected, 'A release must contain exactly the three tested platform archives');
  console.log(`Verified three release assets: ${actual.join(', ')}`);
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${manifest.version}\n`);
}
console.log(`Release: ${tag}`);
