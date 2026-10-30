import type { AnnaRuntime } from './types';

let connection: Promise<AnnaRuntime> | undefined;

/** One connection per iframe, including React's development StrictMode remount. */
export function connectAnna(): Promise<AnnaRuntime> {
  connection ??= loadRuntime().catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

async function loadRuntime(): Promise<AnnaRuntime> {
  const sdkUrl = '/static/anna-apps/_sdk/latest/index.js';
  // The Anna host serves the SDK; Vite must leave this import for the iframe.
  const { AnnaAppRuntime } = await import(/* @vite-ignore */ sdkUrl);
  const anna: AnnaRuntime = await AnnaAppRuntime.connect();
  if (!anna.storage?.get || !anna.storage?.set || !anna.tools?.invoke) {
    throw new Error('Anna 未提供所需的笔记和总结权限，请检查应用配置。');
  }
  return anna;
}
