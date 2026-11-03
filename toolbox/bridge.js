import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const inDesktopApp = typeof window !== 'undefined'
  && window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label === 'main';

// Outside the desktop app (e.g. the web preview) commands cannot run; say so plainly.
export async function invoke(command, args) {
  if (!inDesktopApp) {
    throw 'This needs the Capsule desktop app. The web preview cannot reach your device.';
  }

  return tauriInvoke(command, args);
}

// A deadline does not cancel IPC; use this only for read-only inspection.
export async function readWithDeadline(operation, timeoutMs = 5000, label = 'Device inspection') {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}
