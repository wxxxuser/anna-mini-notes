import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

/** Run the actual packaged executable outside the source tree. */
export async function smokeBinary(binaryPath, expectedManifest) {
  const expected = expectedManifest ?? JSON.parse(await readFile(
    path.join(projectRoot, 'executas/mini-notes/manifest.json'), 'utf8',
  ));
  const executable = path.resolve(binaryPath);
  const sampledSummary = 'Smoke fixture: follow up with the customer tomorrow.';
  const invokeId = 'binary-smoke-invoke';

  await new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      cwd: tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let finished = false;
    let completed = false;
    let samplingCount = 0;
    let stderr = '';
    let expectedId = 1;
    const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    const timeout = setTimeout(() => fail(new Error('Binary smoke test timed out after 30 seconds')), 30_000);

    function fail(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reader.close();
      child.kill();
      reject(new Error(`${error.message}${stderr ? `\nTool stderr:\n${stderr}` : ''}`, { cause: error }));
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) fail(error);
      });
    }

    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-16_384); });
    child.on('close', (code, signal) => {
      if (finished) return;
      if (!completed || code !== 0) {
        fail(new Error(`Binary exited before a successful smoke test (code=${code}, signal=${signal})`));
        return;
      }
      finished = true;
      clearTimeout(timeout);
      resolve();
    });
    reader.on('line', (line) => {
      try {
        // Any banner or debug line on stdout is a test failure.
        const message = JSON.parse(line);
        assert.equal(message.jsonrpc, '2.0');
        if (message.method) {
          assert.equal(expectedId, 3, 'Reverse sampling must occur during invoke');
          assert.equal(message.method, 'sampling/createMessage');
          assert.equal(++samplingCount, 1);
          assert.equal(message.params.metadata.executa_invoke_id, invokeId);
          assert.match(JSON.stringify(message.params.messages), /customer tomorrow/);
          send({
            jsonrpc: '2.0', id: message.id,
            result: {
              role: 'assistant', content: { type: 'text', text: sampledSummary },
              model: 'binary-smoke-fixture', stopReason: 'endTurn',
            },
          });
          return;
        }
        assert.equal(message.id, expectedId);
        assert.equal(message.error, undefined, JSON.stringify(message.error));
        if (expectedId === 1) {
          assert.equal(message.result.protocolVersion, '2.0');
          assert.deepEqual(message.result.client_capabilities.sampling, {});
          expectedId = 2;
          send({ jsonrpc: '2.0', id: 2, method: 'describe', params: {} });
        } else if (expectedId === 2) {
          assert.equal(message.result.name, expected.name);
          assert.equal(message.result.version, expected.version);
          assert.deepEqual(message.result.host_capabilities, ['llm.sample']);
          assert(message.result.tools.some((tool) => tool.name === 'summarize' && Array.isArray(tool.parameters)));
          expectedId = 3;
          send({
            jsonrpc: '2.0', id: 3, method: 'invoke',
            params: {
              tool: 'summarize', context: { invoke_id: invokeId },
              arguments: { notes: [{ id: 'smoke-note', order: 1, content: 'Follow up with the customer tomorrow.' }] },
            },
          });
        } else {
          assert.equal(message.result.success, true);
          assert.equal(samplingCount, 1);
          assert.equal(message.result.data.summary, sampledSummary);
          completed = true;
          // EOF must terminate cleanly after more than one request was served.
          child.stdin.end();
        }
      } catch (error) {
        fail(error);
      }
    });
    send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2.0', capabilities: { sampling: {} } },
    });
  });
  console.log(`Binary smoke passed: initialize, describe, invoke, reverse sampling, EOF (${path.basename(executable)})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/smoke-binary.mjs <executable>');
    process.exitCode = 1;
  } else {
    await smokeBinary(process.argv[2]).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
