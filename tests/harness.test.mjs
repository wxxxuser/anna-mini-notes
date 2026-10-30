import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { annaEnvironment, projectRoot as root } from '../scripts/runtime-env.mjs';

test('real --no-llm harness: Host storage persists operations and tool sampling reaches disabled LLM', { timeout: 40_000 }, async () => {
  const portProbe = createServer();
  await new Promise(accept => portProbe.listen(0, '127.0.0.1', accept));
  const port = portProbe.address().port;
  await new Promise(accept => portProbe.close(accept));
  const env = annaEnvironment({ offline: true });
  const child = spawn(process.execPath, [resolve(root, 'node_modules/@anna-ai/cli/dist/cli.js'),
    'dev', '--bundle', 'dist', '--slug', 'mini-notes', '--no-llm', '--no-watch', '--port', String(port)],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '', stderr = '';
  const records = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const outDir = resolve(root, 'artifacts');
  await mkdir(outDir, { recursive: true });
  try {
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error(`Harness startup timed out: ${stderr}`)), 20_000);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        if (stdout.includes('dashboard http://')) { clearTimeout(timer); accept(); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Harness exited ${code}: ${stderr}\n${stdout}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const dashboard = await fetch(base);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /iframe/i);
    const sdk = await fetch(`${base}/static/anna-apps/_sdk/latest/index.js`);
    assert.equal(sdk.status, 200);
    const session = await (await fetch(`${base}/api/session/create`, { method: 'POST' })).json();
    assert.ok(session.session_id);
    async function call(ns, method, args = {}) {
      const response = await fetch(`${base}/api/session/call`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, ns, method, args }),
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      // Deliberately exclude the session-create response (it contains a dev token).
      records.push({ ns, method, args, response: result });
      return result;
    }
    assert.equal((await call('window', 'hello')).ok, true);
    const initial = await call('storage', 'get', { key: 'notes' });
    assert.equal(initial.result.value, null);
    const notes = [
      { id: 'integration-1', order: 1, content: '明天跟客户 follow up', createdAt: '2026-10-29T00:00:00.000Z' },
      { id: 'integration-2', order: 2, content: '修复登录 bug', createdAt: '2026-10-29T00:01:00.000Z' },
    ];
    const notebook = { version: 1, nextOrder: 3, notes };
    assert.equal((await call('storage', 'set', { key: 'notes', value: notebook })).ok, true);
    assert.deepEqual((await call('storage', 'get', { key: 'notes' })).result.value, notebook);
    const remaining = { ...notebook, notes: notes.slice(1) };
    assert.equal((await call('storage', 'set', { key: 'notes', value: remaining })).ok, true);
    assert.deepEqual((await call('storage', 'get', { key: 'notes' })).result.value, remaining);
    const summary = await call('tools', 'invoke', { tool_id: 'tool-dev-mini-notes', method: 'summarize', args: { notes: remaining.notes } });
    assert.match(JSON.stringify(summary), /harness started with --no-llm/);
    assert.match(JSON.stringify(summary), /-32603/);
    assert.match(stderr, /sampling\.request/);
    assert.match(stderr, /sampling\/createMessage/);
    assert.doesNotMatch(JSON.stringify(summary), /"summary"\s*:/, 'No fabricated summary on errors');
  } finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
    await writeFile(resolve(outDir, 'harness-rpc.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n');
    await writeFile(resolve(outDir, 'harness.stderr.log'), stderr);
  }
});
