import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const json = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

test('App, discovery and tool identity agree, and only required Host APIs are granted', async () => {
  const [app, tool, discovery] = await Promise.all([
    json('manifest.json'), json('executas/mini-notes/manifest.json'), json('executas/mini-notes/executa.json'),
  ]);
  assert.equal(app.schema, 2, 'Schema 2 retains the permissions field required by the assignment');
  assert.equal(app.required_executas[0].tool_id, tool.name);
  assert.equal(discovery.tool_id, tool.name);
  assert.deepEqual(app.ui.host_api.tools, [tool.name]);
  assert.deepEqual(app.ui.host_api.storage.toSorted(), ['get', 'set']);
  // Runtime 0.2.0a30 routes reverse sampling through the same llm.complete ACL.
  // This grant is needed by the tool bridge; UI code must never call it directly.
  assert.deepEqual(app.ui.host_api.llm, ['complete']);
  assert.ok(!app.dev.mocks, 'UI harness must not inject a fabricated tool summary');
  assert.ok(tool.host_capabilities.includes('llm.sample'));
  const summarize = tool.tools.find(item => item.name === 'summarize');
  assert.ok(summarize.parameters.some(item => item.name === 'notes' && item.required));
});

test('Built bundle contains the correct tool identity and a runnable entry', async () => {
  const { readdir } = await import('node:fs/promises');
  const app = await json('manifest.json');
  const html = await readFile(new URL(`../dist/${app.ui.bundle.entry}`, import.meta.url), 'utf8');
  assert.match(html, /<script[^>]+src=/);
  const files = await readdir(new URL('../dist/assets/', import.meta.url));
  const scripts = await Promise.all(files.filter(name => name.endsWith('.js')).map(name =>
    readFile(new URL(`../dist/assets/${name}`, import.meta.url), 'utf8')));
  assert.ok(scripts.join('\n').includes(app.required_executas[0].tool_id), 'Front-end bundle must target declared tool');
});
