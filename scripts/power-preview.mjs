import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve('../_reviews/voyager-seven-prs');
await fs.mkdir(out, { recursive: true });
const server = await createServer({ mode: 'demo', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const errors = [];
async function open(width = 1440) {
  const p = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base);
  await p.waitForSelector('.grid .cell');
  await p.waitForFunction(async () => (await import('/src/store.js')).state.settingsLoaded);
  await p.evaluate(async () => {
    window.store = await import('/src/store.js');
    window.api = (await import('/src/api/moonraker.js')).api;
    store.state.settings.sound.enabled = false;
    store.state.settings.autoLayout = false;
    store.state.settings.lang = 'en';
    store.state.uiScale = 100;
  });
  await p.waitForTimeout(600);
  return p;
}
async function arrange(p, layout) {
  await p.evaluate((layout) => {
    store.state.settingsOpen = null;
    store.state.settings.layout = layout;
    store.state.settings.hiddenCards = store
      .DEFAULT_LAYOUT()
      .map((x) => x.i)
      .filter((id) => !layout.some((x) => x.i === id));
    store.state.settings.collapsed = {};
    store.state.settings.layoutWidths = null;
    store.state.settings = { ...store.state.settings, autoLayout: false };
  }, layout);
  await p.waitForTimeout(600);
}
async function shot(p, name, selector) {
  await p.evaluate(() => document.fonts.ready);
  if (selector) await p.locator(selector).screenshot({ path: path.join(out, name + '.png') });
  else await p.screenshot({ path: path.join(out, name + '.png') });
}
try {
  const p = await open();
  await arrange(p, [
    { i: 'temps', x: 0, y: 0, w: 5, h: 8 },
    { i: 'toolhead', x: 5, y: 0, w: 7, h: 8 },
  ]);
  await p.evaluate(() => {
    store.state.settings.tempsStyle = 'compact';
  });
  await p.waitForTimeout(400);
  assert.equal(await p.locator('.temps .hp').count(), 5);
  await shot(p, '05-compact', '.card.temps');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(500);
  const bounds = await p.locator('.temps .hp').evaluateAll((ns) =>
    ns.map((n) => ({
      text: n.textContent,
      visible: n.getBoundingClientRect().right <= n.closest('.hr').getBoundingClientRect().right,
    })),
  );
  assert(bounds.every((n) => n.visible));
  await shot(p, '05-compact-phone', '.card.temps');
  console.log(JSON.stringify(bounds));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
