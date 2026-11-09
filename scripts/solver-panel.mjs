// Embedded solver: compact by default, preserves progress, and accepts old issue links.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const server = await createServer({ mode: 'demo', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/calibrations`);
  await p.waitForSelector('.solver-panel');
  await p.waitForSelector('.cal > .cp');
  const panel = p.locator('.solver-panel'),
    summary = panel.locator('summary');
  assert.equal(await panel.getAttribute('open'), null);
  assert.ok((await panel.boundingBox()).height < 80);
  assert.equal(await p.locator('.solver-body .ps').count(), 0);
  if (process.env.SOLVER_SCREENSHOTS) await p.screenshot({ path: '../calibrations-solver-collapsed.png' });
  await summary.click();
  await panel.locator('.search input').waitFor();
  if (process.env.SOLVER_SCREENSHOTS) await p.screenshot({ path: '../calibrations-solver-open.png' });
  await panel.locator('.search input').fill('ringing');
  await panel.locator('.rr').first().click();
  const progress = await panel.locator('.crumbs').innerText();
  await summary.click();
  assert.equal(await panel.getAttribute('open'), null);
  await summary.click();
  assert.equal(await panel.locator('.crumbs').innerText(), progress);
  await p.evaluate(async () => {
    const { state } = await import('/src/store.js');
    state.settings.issues = [
      { id: 'test-issue', msg: 'Lost communication with MCU', source: 'klipper', at: Date.now(), count: 1 },
    ];
    location.hash = '/solver/test-issue';
  });
  await p.waitForTimeout(500);
  assert.notEqual(await panel.getAttribute('open'), null);
  assert.ok((await panel.innerText()).includes('Lost communication with MCU'));
  await panel.getByRole('button', { name: 'Start over', exact: true }).click();
  await p.waitForTimeout(200);
  assert.ok(p.url().endsWith('#/calibrations/solver'));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('Solver panel: collapsed entry, progress preservation, issue link, reset and phone width passed');
} finally {
  await browser.close();
  await server.close();
}
