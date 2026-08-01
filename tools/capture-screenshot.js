import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP_URL = 'http://127.0.0.1:4173';
const OUTPUT = resolve(ROOT, 'assets/screenshots/gameplay.png');

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Timed out waiting for the screenshot server');
}

const server = spawn(process.execPath, [resolve(ROOT, 'tests/server.js')], {
  cwd: ROOT,
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(APP_URL);
  await page.locator('[data-level="medium"]').click();

  for (let move = 0; move < 5; move += 1) {
    const state = await page.evaluate(() => JSON.parse(
      localStorage.getItem('sudoku-instantaneo-state-v2'),
    ));
    const index = state.values.findIndex((value, cellIndex) => !value && !state.puzzle[cellIndex]);
    await page.locator(`[data-index="${index}"]`).click();
    await page.keyboard.press(String(state.solution[index]));
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await page.screenshot({ path: OUTPUT });
  await context.close();
  console.log(`Screenshot written to ${OUTPUT}`);
} finally {
  await browser?.close();
  server.kill();
}
