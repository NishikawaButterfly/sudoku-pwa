import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP_URL = 'http://127.0.0.1:4173';
const server = spawn(process.execPath, [resolve(ROOT, 'tests/server.js')], {
  cwd: ROOT,
  stdio: 'inherit',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error('The test server exited before it became ready');
    try {
      const response = await fetch(APP_URL);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Timed out waiting for the test server');
}

function runPlaywright() {
  const cli = resolve(ROOT, 'node_modules/@playwright/test/cli.js');
  const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
    cwd: ROOT,
    env: { ...process.env, SUDOKU_EXTERNAL_SERVER: '1' },
    stdio: 'inherit',
  });
  return new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Playwright was terminated by ${signal}`));
      else resolvePromise(code ?? 1);
    });
  });
}

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await runPlaywright();
} finally {
  server.kill();
}

process.exitCode = exitCode;

