#!/usr/bin/env node
"use strict";

// Compatibility adapter for anna-app-runtime-local 0.2.0a30: its App harness
// invokes plugins without initialize. Keep index.cjs strict and perform a real
// v2 handshake here before forwarding the harness's first request. The standalone
// CLI's own initialize is forwarded normally. This file is NOT a release binary.
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const readline = require("node:readline");

const child = spawn(process.execPath, [path.join(__dirname, "index.cjs")], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const bootstrapId = `dev-bootstrap:${randomUUID()}`;
const queuedInput = [];
let queuedBytes = 0;
let ready = false;
let hostEnded = false;
let childClosed = false;
let failed = false;
let inputQueue = Promise.resolve();
let outputQueue = Promise.resolve();
let terminationTimer;
const hostReader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const toolReader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

function log(event) {
  process.stderr.write(JSON.stringify({ event, adapter: "anna-local-harness-v2" }) + "\n");
}

function writeLine(stream, line) {
  return new Promise((resolve, reject) => {
    stream.write(line + "\n", "utf8", (error) => error ? reject(error) : resolve());
  });
}

function terminateChild() {
  if (childClosed) return;
  child.stdin.destroy();
  child.kill();
  terminationTimer ??= setTimeout(() => {
    if (!childClosed) child.kill("SIGKILL");
  }, 1500);
  terminationTimer.unref();
}

function fail(event) {
  if (failed) return;
  failed = true;
  process.exitCode = 1;
  clearTimeout(bootstrapTimeout);
  log(event);
  process.stdin.destroy();
  hostReader.close();
  terminateChild();
}

function forwardInput(line) {
  inputQueue = inputQueue.then(() => writeLine(child.stdin, line)).catch(() => fail("compat.input_closed"));
}

function endChildInput() {
  inputQueue.then(() => {
    if (!childClosed && !child.stdin.destroyed) child.stdin.end();
  });
}

const bootstrapTimeout = setTimeout(() => fail("compat.initialize_timeout"), 5000);
child.stderr.pipe(process.stderr, { end: false });
child.on("error", () => fail("compat.spawn_failed"));
child.stdin.on("error", () => {
  if (!childClosed && !hostEnded) fail("compat.input_closed");
});
process.stdout.on("error", () => fail("compat.host_output_closed"));
process.stdin.on("error", () => fail("compat.host_input_error"));

hostReader.on("line", (line) => {
  if (failed || childClosed) return;
  if (ready) {
    forwardInput(line);
    return;
  }
  queuedBytes += Buffer.byteLength(line, "utf8") + 1;
  if (queuedBytes > 16 * 1024 * 1024) {
    fail("compat.startup_buffer_exceeded");
    return;
  }
  queuedInput.push(line);
});
hostReader.on("close", () => {
  hostEnded = true;
  if (ready) endChildInput();
});

toolReader.on("line", (line) => {
  if (failed) return;
  if (!ready) {
    let frame;
    try { frame = JSON.parse(line); } catch { fail("compat.initialize_invalid_json"); return; }
    const sampling = frame.result?.client_capabilities?.sampling;
    if (frame.jsonrpc !== "2.0" || frame.id !== bootstrapId || frame.error ||
        frame.result?.protocolVersion !== "2.0" || sampling === null ||
        typeof sampling !== "object" || Array.isArray(sampling)) {
      fail("compat.initialize_rejected");
      return;
    }
    clearTimeout(bootstrapTimeout);
    ready = true;
    log("compat.initialize_v2_complete");
    for (const pendingLine of queuedInput.splice(0)) forwardInput(pendingLine);
    queuedBytes = 0;
    if (hostEnded) endChildInput();
    return;
  }
  // After bootstrap, every frame (including further initialize requests and
  // reverse-RPC responses) is relayed without rewriting ids or payloads.
  outputQueue = outputQueue.then(() => writeLine(process.stdout, line)).catch(() => fail("compat.host_output_closed"));
});

child.on("close", async (code, signal) => {
  childClosed = true;
  clearTimeout(bootstrapTimeout);
  clearTimeout(terminationTimer);
  if (!ready && !failed) fail("compat.child_exited_before_initialize");
  await outputQueue;
  if (!failed) process.exitCode = code ?? (signal ? 1 : 0);
  process.stdin.destroy();
  hostReader.close();
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    hostEnded = true;
    process.stdin.destroy();
    hostReader.close();
    clearTimeout(bootstrapTimeout);
    terminateChild();
  });
}

forwardInput(JSON.stringify({
  jsonrpc: "2.0",
  id: bootstrapId,
  method: "initialize",
  params: {
    protocolVersion: "2.0",
    capabilities: { sampling: {} },
    clientInfo: { name: "mini-notes-local-harness-adapter", version: "1.0.0" },
  },
}));
