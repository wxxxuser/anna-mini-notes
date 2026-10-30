import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = resolve(root, 'fixtures/sampling.jsonl');
const rows = (await readFile(fixture, 'utf8')).trim().split(/\r?\n/).filter(line => !line.startsWith('#')).map(JSON.parse);
const expected = rows.find(row => row.ns === 'sampling' && row.method === 'createMessage').result.content.text;
const notes = [
  { id: 'test-1', order: 1, content: '明天跟客户 follow up' },
  { id: 'test-2', order: 2, content: '修复登录 bug' },
  { id: 'test-3', order: 3, content: '整理 Workshop 内容想法' },
];
const args = [resolve(root, 'node_modules/@anna-ai/cli/dist/cli.js'), 'executa', 'dev',
  '--dir', resolve(root, 'executas/mini-notes'), '--mock-sampling', fixture,
  '--invoke', 'summarize', '--args', JSON.stringify({ notes }), '--json',
  '--no-agent', '--no-image', '--no-upload', '--storage', 'off'];
const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
const timer = setTimeout(() => child.kill(), 25_000);
let code;
try {
  code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
} finally { clearTimeout(timer); }
const output = resolve(root, 'artifacts');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'sampling-cli.stdout.json'), stdout);
await writeFile(resolve(output, 'sampling-cli.stderr.log'), stderr);
assert.equal(code, 0, `Official CLI failed: ${stderr}`);
const result = JSON.parse(stdout);
assert.equal(result.success, true);
assert.equal(result.data.summary, expected, 'Summary must be the fixture reply, byte-for-byte');
assert.match(stderr, /sampling\.request/);
assert.match(stderr, /sampling\/createMessage/);
assert.match(stderr, /sampling\.response/);
console.log('PASS: official anna-app executa dev --mock-sampling returned the fixture through reverse RPC.');
console.log('Evidence: artifacts/sampling-cli.stdout.json and artifacts/sampling-cli.stderr.log');
