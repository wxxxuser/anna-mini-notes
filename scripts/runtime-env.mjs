import { existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeVersion = '0.2.0a30';

export function annaEnvironment({ offline = false } = {}) {
  const env = { ...process.env };
  // Reuse the existing key: Windows environment names are case-insensitive.
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  const uvBin = resolve(projectRoot, '.tools/python/bin');
  if (existsSync(uvBin)) env[pathKey] = `${uvBin}${delimiter}${env[pathKey] ?? ''}`;
  // Share dependency downloads between desktop-app and ordinary terminal launches.
  env.UV_CACHE_DIR ??= resolve(projectRoot, '.tools/uv-cache');
  env.UV_HTTP_TIMEOUT ??= '120';
  env.UV_HTTP_RETRIES ??= '3';
  if (offline) env.UV_OFFLINE = 'true';
  return env;
}
