import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Unit tests exercise the real frontend service modules. These in-memory
// doubles are not installed in the App UI harness or used as sampling mocks.
async function loadService(relativePath) {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  const source = Buffer.from(bundled.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${source}`);
}

const [{ createNote, removeNote }, { summarizeNotes }] = await Promise.all([
  loadService('../src/anna/storage.ts'),
  loadService('../src/anna/tools.ts'),
]);

function makeNotebook(count, content = 'a'.repeat(2_000)) {
  return {
    version: 1,
    nextOrder: count + 1,
    notes: Array.from({ length: count }, (_, index) => ({
      id: `note-${index + 1}`,
      content,
      order: index + 1,
      createdAt: '2026-10-29T10:00:00.000Z',
    })),
  };
}

function storageHost(initial, { setError } = {}) {
  let saved = structuredClone(initial);
  const calls = [];
  return {
    calls,
    snapshot: () => structuredClone(saved),
    anna: {
      storage: {
        async get(args) {
          calls.push({ method: 'get', ...structuredClone(args) });
          assert.equal(args.key, 'notes');
          return { value: structuredClone(saved) };
        },
        async set(args) {
          calls.push({ method: 'set', ...structuredClone(args) });
          assert.equal(args.key, 'notes');
          if (setError) throw setError;
          saved = structuredClone(args.value);
          return { ok: true };
        },
      },
    },
  };
}

test('creating a note may reach exactly 100000 total content characters', async () => {
  const initial = makeNotebook(50);
  initial.notes[49].content = 'a'.repeat(1_999);
  const host = storageHost(initial);
  const result = await createNote(host.anna, 'b');

  assert.equal(result.notes.reduce((total, note) => total + note.content.length, 0), 100_000);
  assert.equal(result.notes.length, 51);
  assert.equal(result.notes.at(-1).order, 51);
  assert.deepEqual(host.snapshot(), result);
  assert.deepEqual(host.calls.map(call => call.method), ['get', 'set']);
});

test('100001 content characters are rejected without a storage write or lost notes', async () => {
  const initial = makeNotebook(50);
  const host = storageHost(initial);

  await assert.rejects(createNote(host.anna, 'b'), /100,000/);
  assert.deepEqual(host.calls.map(call => call.method), ['get']);
  assert.deepEqual(host.snapshot(), initial);
});

test('UTF-8 storage budget rejects multibyte content below the text-length limit', async () => {
  const initial = makeNotebook(33, '中'.repeat(2_000));
  assert.ok(Buffer.byteLength(JSON.stringify(initial), 'utf8') < 200 * 1024);
  const host = storageHost(initial);

  await assert.rejects(createNote(host.anna, '文'.repeat(2_000)), /笔记空间已满/);
  assert.deepEqual(host.calls.map(call => call.method), ['get']);
  assert.deepEqual(host.snapshot(), initial);
});

test('a rejected Host storage write propagates failure and preserves saved content', async () => {
  const initial = makeNotebook(1, 'Already saved');
  const failure = Object.assign(new Error('storage write denied'), { code: 'permission_denied' });
  const host = storageHost(initial, { setError: failure });

  await assert.rejects(createNote(host.anna, 'Do not report this as saved'), error => error === failure);
  assert.deepEqual(host.calls.map(call => call.method), ['get', 'set']);
  assert.deepEqual(host.snapshot(), initial);
});

test('deletion persists the remaining notes and never reuses an earlier order', async () => {
  const host = storageHost(makeNotebook(3, 'Saved note'));
  const afterDelete = await removeNote(host.anna, 'note-2');
  assert.deepEqual(afterDelete.notes.map(note => note.order), [1, 3]);
  assert.equal(afterDelete.nextOrder, 4);
  assert.deepEqual(host.snapshot(), afterDelete);

  const afterAdd = await createNote(host.anna, 'New note');
  assert.deepEqual(afterAdd.notes.map(note => note.order), [1, 3, 4]);
  assert.equal(afterAdd.nextOrder, 5);
  assert.deepEqual(host.snapshot(), afterAdd);
  assert.deepEqual(host.calls.map(call => call.method), ['get', 'set', 'get', 'set']);
});

test('summary text is returned verbatim through documented and legacy response envelopes', async () => {
  const text = '  Unique model response.\n第二行保持原样。  ';
  const payload = { summary: text };
  const responses = [
    payload,
    { result: payload },
    { success: true, data: payload },
    { success: true, data: { success: true, data: payload } },
    { ok: true, result: { result: { success: true, data: { success: true, data: payload } } } },
  ];
  const notes = makeNotebook(1, 'Input that is different from the model response').notes;
  for (const response of responses) {
    let invoked = 0;
    const anna = { tools: { async invoke(args) {
      invoked += 1;
      assert.equal(args.tool_id, 'tool-dev-mini-notes');
      assert.equal(args.method, 'summarize');
      assert.deepEqual(args.args.notes, notes);
      return structuredClone(response);
    } } };
    assert.equal(await summarizeNotes(anna, notes), text);
    assert.equal(invoked, 1);
  }
});

test('nested and thrown host errors preserve the actual --no-llm diagnostic', async () => {
  const message = '[-32603] harness started with --no-llm';
  const responses = [
    { success: true, data: { success: false, error: message } },
    { result: { success: true, data: { success: false, error: { code: -32603, message } } } },
    { ok: false, error: { code: 'tool_failed', message } },
  ];
  const notes = makeNotebook(1, 'Saved note').notes;
  for (const response of responses) {
    const anna = { tools: { async invoke() { return response; } } };
    await assert.rejects(summarizeNotes(anna, notes), /\[-32603\] harness started with --no-llm/);
  }
  const sdkError = Object.assign(new Error(message), { code: 'tool_failed' });
  const anna = { tools: { async invoke() { throw sdkError; } } };
  await assert.rejects(summarizeNotes(anna, notes), error => error === sdkError);
});

test('empty notes never invoke a tool and empty model replies do not become a fake summary', async () => {
  let calls = 0;
  const anna = { tools: { async invoke() {
    calls += 1;
    return { success: true, data: { summary: '   ' } };
  } } };
  await assert.rejects(summarizeNotes(anna, []), /先添加一条笔记/);
  assert.equal(calls, 0);
  await assert.rejects(summarizeNotes(anna, makeNotebook(1, 'Saved note').notes), /模型未返回总结内容/);
  assert.equal(calls, 1);
});
