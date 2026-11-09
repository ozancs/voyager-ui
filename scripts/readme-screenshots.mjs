// Capture the README tour from the local demo, at 800 × 400 pixels per page.
// Run from the repo root after installing Playwright Chromium. No printer connection is used.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const server = await createServer({ mode: 'demo', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=gl', '--enable-webgl'] });
await fs.mkdir('docs/screenshots', { recursive: true });
try {
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  const routes = process.env.R?.split(',') || [
    'dashboard',
    'webcam',
    'console',
    'heightmap',
    'calibrations',
    'files',
    'history',
    'machine',
    'health',
    'quick',
    'config',
    'fleet',
    'theme',
    'viewer',
  ];
  for (const route of routes) {
    // A fresh page prevents dialogs and other UI state leaking into the next screenshot.
    const p = await browser.newPage({ viewport: { width: 1600, height: 800 }, deviceScaleFactor: 0.5 });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(base + '#/' + route);
    await p.waitForTimeout(2500);
    await p.evaluate(() => document.fonts.ready);
    if (route === 'viewer') {
      await p.waitForFunction(() => document.querySelector('.cv .fn')?.textContent === '3dbenchy_PETG_57m14s.gcode');
      for (let i = 0; i < 30; i++) {
        await p.waitForTimeout(10000);
        const loading = await p.locator('.cv .ld').allTextContents();
        console.log('viewer', loading);
        if (!loading.length) break;
      }
      if (await p.locator('.cv .ld').count()) throw Error('Viewer still loading');
    }
    if (errors.length) throw Error(errors.join('\n'));
    await p.screenshot({ path: `docs/screenshots/${route}.png` });
    console.log('captured', route);
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
