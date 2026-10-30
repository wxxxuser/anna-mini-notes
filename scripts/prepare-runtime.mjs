import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { annaEnvironment, projectRoot, runtimeVersion } from './runtime-env.mjs';

// Warm the exact bridge command before the official CLI's fixed 8-second timeout.
// Probe the real bridge offline; a cache directory alone does not prove readiness.
async function warmBridge(offline) {
  const child = spawn('uvx', ['--from', `anna-app-runtime-local@${runtimeVersion}`, 'anna-app-bridge'],
    { cwd: projectRoot, env: annaEnvironment({ offline }), stdio: ['pipe', 'pipe', offline ? 'pipe' : 'inherit'], windowsHide: true });
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  if (offline) child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-8_192); });
  let timer;
  let stopTimer;
  let cancel;
  try {
    await new Promise((accept, reject) => {
      let ready = false;
      // Only the offline probe is bounded. A healthy slow download must not be
      // killed by an overall timer; uv handles request timeouts and retries.
      if (offline) timer = setTimeout(() => reject(new Error('Cached Anna runtime did not signal ready in 30 seconds.')), 30_000);
      cancel = () => reject(Object.assign(new Error('Anna runtime preparation cancelled.'), { code: 'CANCELLED' }));
      process.once('SIGINT', cancel);
      process.once('SIGTERM', cancel);
      child.once('error', error => reject(Object.assign(new Error(`Could not start uvx; see README for uv installation. ${error.message}`), { code: error.code })));
      child.stdin.on('error', reject);
      lines.on('line', line => {
        let frame;
        try { frame = JSON.parse(line); } catch { return; }
        if (ready || frame?.method !== '_ready') return;
        ready = true;
        clearTimeout(timer);
        // No sessions or tools are created. EOF lets the bridge exit normally.
        stopTimer = setTimeout(() => reject(new Error('Anna runtime did not exit after the readiness check.')), 5_000);
        child.stdin.end();
      });
      child.once('close', (code, signal) => {
        if (ready && code === 0) accept();
        else reject(new Error(`Anna runtime exited before preparation completed (code=${code}, signal=${signal ?? '-'}).\n${stderr.trim() || 'See the download or Python messages above.'}`));
      });
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(stopTimer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    lines.close();
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else child.kill('SIGTERM');
    }
  }
}

console.log(`Checking Anna runtime ${runtimeVersion} in ${annaEnvironment().UV_CACHE_DIR}...`);
try {
  try {
    await warmBridge(true);
  } catch (error) {
    if (error.code === 'CANCELLED' || error.code === 'ENOENT' || /^(1|true)$/i.test(annaEnvironment().UV_OFFLINE ?? '')) throw error;
    console.log('Runtime cache is not ready. Downloading dependencies; slow downloads have no overall time limit. Press Ctrl+C to cancel.');
    await warmBridge(false);
    // Verify the exact offline path that the dev launcher will use.
    await warmBridge(true);
  }
  console.log(`Anna runtime ready: ${runtimeVersion} (cached; dev can start without uv downloads)`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
