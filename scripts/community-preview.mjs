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
    { i: 'temps', x: 0, y: 0, w: 4, h: 7 },
    { i: 'toolhead', x: 4, y: 0, w: 8, h: 7 },
  ]);
  await shot(p, '01-desktop');
  const savedLayout = await p.evaluate(() => JSON.stringify(store.state.settings.layout));
  await p.setViewportSize({ width: 1050, height: 1000 });
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => JSON.stringify(store.state.settings.layout)), savedLayout);
  await p.setViewportSize({ width: 1440, height: 1000 });
  const tablet = await open(1000);
  await arrange(tablet, [
    { i: 'toolhead', x: 0, y: 0, w: 12, h: 5 },
    { i: 'temps', x: 0, y: 5, w: 12, h: 6 },
  ]);
  await shot(tablet, '01-tablet');
  // Record-level concurrency and backup/restore with actual store save calls.
  const sharedDB = {};
  for (const client of [p, tablet]) {
    await client.exposeFunction('reviewDB', (method, params) => {
      const ns = (sharedDB[params.namespace] ||= {});
      if (method.endsWith('post_item')) ns[params.key] = structuredClone(params.value);
      return { value: structuredClone(params.key == null ? ns : ns[params.key]) };
    });
    await client.evaluate(() => {
      const original = api.call.bind(api);
      api.call = (method, params) =>
        method.startsWith('server.database.') ? window.reviewDB(method, params) : original(method, params);
    });
  }
  await Promise.all([p, tablet].map((client) => client.evaluate(() => store.saveSettings())));
  await p.waitForTimeout(650);
  assert.equal(Object.keys(sharedDB['voyager-ui-layouts']).length, 2);
  const desktopId = await p.evaluate(() => store.deviceLayout.value.id);
  const desktopRecord = JSON.stringify(sharedDB['voyager-ui-layouts'][desktopId].data);
  await tablet.evaluate(() => {
    store.state.settings.cardTitles = { toolhead: 'Tablet motion' };
    store.saveSettings();
  });
  await tablet.waitForTimeout(650);
  assert.equal(JSON.stringify(sharedDB['voyager-ui-layouts'][desktopId].data), desktopRecord);
  const first = await p.evaluate(async () => {
    store.saveSettings();
    await new Promise((r) => setTimeout(r, 650));
    return await store.exportSettingsBackup();
  });
  await tablet.evaluate(async (data) => {
    await store.restoreDeviceLayouts(data.deviceLayouts);
  }, first);
  const both = await tablet.evaluate(async () => {
    store.saveSettings();
    await new Promise((r) => setTimeout(r, 650));
    return await store.exportSettingsBackup();
  });
  assert.equal(Object.keys(both.deviceLayouts).length, 2);
  await tablet.evaluate(async () => {
    store.state.settingsOpen = 'general';
  });
  assert.equal(await tablet.getByText('Own dashboard layout', { exact: true }).count(), 0);
  await tablet.close();

  await p.evaluate(() => {
    store.state.settingsOpen = 'appearance';
  });
  await p.locator('[data-pk="size"]').first().getByRole('button', { name: 'Smaller', exact: true }).click();
  await p.waitForTimeout(700);
  assert.equal(await p.locator('.dlg.peek-size').count(), 1);
  assert.equal(await p.locator('.dlg.peek-size [data-pk="size"]:visible').count(), 2);
  await shot(p, '02-size-preview');
  await p.evaluate(() => {
    store.state.settingsOpen = null;
    store.state.uiScale = 100;
  });

  await arrange(p, [{ i: 'mmu', x: 0, y: 0, w: 12, h: 8 }]);
  await shot(p, '03-mmu', '.card.mmu');
  await p.getByRole('button', { name: 'MMU menu', exact: true }).click();
  await shot(p, '03-menu');
  await p.evaluate(() => {
    store.state.status.print_stats.state = 'standby';
  });
  await p.getByRole('button', { name: 'MMU maintenance', exact: true }).click();
  await shot(p, '03-maintenance');
  await p.getByRole('button', { name: 'Close', exact: true }).last().click();
  await p.getByRole('button', { name: 'MMU menu', exact: true }).click();
  await p.locator('.po').getByRole('button', { name: 'Check all gates', exact: true }).click();
  await p.evaluate(() => {
    store.state.status.print_stats.state = 'printing';
  });
  assert(await p.getByRole('button', { name: 'Check all gates', exact: true }).last().isDisabled());
  await p.getByRole('button', { name: 'Cancel', exact: true }).last().click();

  await arrange(p, [
    { i: 'temps', x: 0, y: 0, w: 5, h: 8 },
    { i: 'toolhead', x: 5, y: 0, w: 7, h: 8 },
  ]);
  await shot(p, '04-environment', '.ds');
  await p.evaluate(() => {
    store.state.settings.tempsStyle = 'classic';
  });
  await shot(p, '05-classic', '.card.temps');
  await p.evaluate(() => {
    store.state.settings.tempsStyle = 'compact';
  });
  await shot(p, '05-compact', '.card.temps');
  await p.locator('.temps .chip-t').first().click();
  await shot(p, '05-target');
  await p.keyboard.press('Escape');
  await p.locator('.temps .tv').first().click();
  await shot(p, '05-minmax');
  await p.keyboard.press('Escape');

  await p.evaluate(() => {
    store.state.settings.layoutWidths = { idle: 1800 };
  });
  await p.waitForTimeout(400);
  await p.locator('.temps').getByRole('button', { name: 'Presets', exact: true }).click();
  await p.waitForTimeout(400);
  const bounds = await p.evaluate(() => {
    const button = [...document.querySelectorAll('.temps button')].find(
      (e) => e.getAttribute('aria-label') === 'Presets' || e.title === 'Presets' || e.textContent.includes('Presets'),
    );
    const a = button.getBoundingClientRect(),
      b = document.querySelector('.po').getBoundingClientRect();
    return { buttonBottom: a.bottom, menuTop: b.top, menuRight: b.right, viewport: innerWidth };
  });
  assert(Math.abs(bounds.menuTop - bounds.buttonBottom) < 20, JSON.stringify(bounds));
  assert(bounds.menuRight <= bounds.viewport);
  await shot(p, '06-popover');
  await p.keyboard.press('Escape');
  await arrange(p, [{ i: 'toolhead', x: 0, y: 0, w: 8, h: 6 }]);
  await shot(p, '07-circle', '.card.toolhead');
  await p.getByRole('radio', { name: 'Buttons', exact: true }).click();
  await shot(p, '07-buttons', '.card.toolhead');
  await p.evaluate(() => {
    store.state.dashEditReq++;
  });
  await p.waitForTimeout(500);
  await shot(p, '07-customize');
  const original = await createServer({
    root: path.resolve('../voyager-ui'),
    mode: 'demo',
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await original.listen();
  try {
    const before = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await before.goto(`http://127.0.0.1:${original.httpServer.address().port}`);
    await before.waitForFunction(async () => (await import('/src/store.js')).state.settingsLoaded);
    await before.evaluate(async () => {
      window.store = await import('/src/store.js');
      store.state.uiScale = 100;
    });
    await arrange(before, [{ i: 'toolhead', x: 0, y: 0, w: 8, h: 6 }]);
    await before.evaluate(() => {
      store.state.settings.toolheadStyle = 'buttons';
    });
    await before.waitForTimeout(300);
    await shot(before, '07-before', '.card.toolhead');
    await before.close();
  } finally {
    await original.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        errors,
        backupDeviceCount: Object.keys(both.deviceLayouts).length,
        popover: bounds,
        mmuPrintGuard: true,
        sizePreview: true,
      },
      null,
      2,
    ),
  );
  console.log('Preview screenshots and interaction checks passed:', out);
} finally {
  await browser.close();
  await server.close();
}
