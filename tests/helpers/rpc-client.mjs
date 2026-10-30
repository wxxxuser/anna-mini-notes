import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const sourceEntry = fileURLToPath(new URL('../../executas/mini-notes/index.cjs', import.meta.url));

/** A deliberately small host: it never invents responses to reverse RPCs. */
export class RpcClient {
  constructor({ binary = process.env.MINI_NOTES_BINARY, entry = sourceEntry, env = {} } = {}) {
    this.frames = [];
    this.buffer = [];
    this.waiters = [];
    this.stderr = '';
    this.nextId = 1;
    this.failure = null;
    this.closed = false;
    this.child = spawn(binary || process.execPath, binary ? [] : [entry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    this.child.stdin.on('error', (error) => this.fail(error));
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let frame;
      try {
        frame = JSON.parse(line);
        if (!frame || frame.jsonrpc !== '2.0') throw new Error('Invalid JSON-RPC frame');
      } catch (error) {
        this.fail(new Error(`Non-protocol stdout: ${line}`, { cause: error }));
        return;
      }
      this.frames.push(frame);
      const index = this.waiters.findIndex((waiter) => waiter.predicate(frame));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(frame);
      } else {
        this.buffer.push(frame);
      }
    });
    this.exit = new Promise((resolve) => {
      this.child.on('error', (error) => {
        this.fail(error);
        resolve({ code: null, error });
      });
      this.child.on('close', (code, signal) => {
        this.closed = true;
        this.fail(new Error(`Tool closed (${code ?? signal})`));
        resolve({ code, signal });
      });
    });
  }

  fail(error) {
    this.failure ??= error;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  nextFrame(predicate = () => true, timeoutMs = 5000) {
    const index = this.buffer.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.buffer.splice(index, 1)[0]);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const pendingIndex = this.waiters.indexOf(waiter);
        if (pendingIndex >= 0) this.waiters.splice(pendingIndex, 1);
        reject(new Error(`Timed out waiting for protocol frame. stderr=${this.stderr}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  send(frame) {
    this.sendRaw(JSON.stringify(frame));
  }

  sendRaw(line) {
    this.child.stdin.write(line + '\n');
  }

  request(method, params = {}, id = `test:${this.nextId++}`) {
    const response = this.nextFrame((frame) => !frame.method && frame.id === id);
    this.send({ jsonrpc: '2.0', id, method, params });
    return response;
  }

  initialize(version = '2.0') {
    return this.request('initialize', { protocolVersion: version, capabilities: { sampling: {} } });
  }

  respond(id, result) {
    this.send({ jsonrpc: '2.0', id, result });
  }

  async close() {
    if (this.closed) return this.exit;
    this.child.stdin.end();
    let timer;
    try {
      return await Promise.race([
        this.exit,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.child.kill();
            reject(new Error('Tool did not exit after stdin EOF'));
          }, 3000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function toolForTest(t, options) {
  const client = new RpcClient(options);
  t.after(() => client.close());
  return client;
}
