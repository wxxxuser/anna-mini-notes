import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { annaEnvironment, projectRoot as root } from './runtime-env.mjs';

const env = annaEnvironment({ offline: process.argv[2] === 'dev' });
const child = spawn(process.execPath, [resolve(root, 'node_modules/@anna-ai/cli/dist/cli.js'), ...process.argv.slice(2)], {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
