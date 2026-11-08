// Real browser regression: resize the same customized dashboard without altering saved layouts.
// Uses Vite's demo server; never connects to a printer.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const server = await createServer({ mode: 'demo', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.waitForSelector('.grid .cell');
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((x) => x.name)
      .find((u) => /\/src\/store\.js(?:\?|$)/.test(u));
    window.testStore = await import(url);
  });
  const snapshot = () =>
    page.evaluate(() => {
      const s = window.testStore.state.settings;
      return JSON.stringify([s.layout, s.layoutPrint, s.mobileOrder, s.layoutWidths]);
    });
  const rects = () =>
    page.locator('.grid .vgl-item:not(.vgl-item--placeholder)').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
  let views = 0;
  for (const uiScale of [100, 125, 'auto']) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate((uiScale) => {
      const { state } = window.testStore;
      state.settings = { ...state.settings, uiScale, autoLayout: false, layoutWidths: null };
      state.dashEditReq++;
    }, uiScale);
    await page.waitForTimeout(500);
    await page.locator('.dbar').getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForTimeout(500);
    const before = await snapshot();
    const initial = await rects();
    for (const width of [1600, 1366, 1100, 1024, 768, 390, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.waitForTimeout(550);
      assert.equal(await snapshot(), before, `saved layout changed at ${width}/${uiScale}`);
      const boxes = await rects();
      for (let i = 0; i < boxes.length; i++) {
        const a = boxes[i];
        for (const b of boxes.slice(i + 1)) {
          assert.ok(
            !(a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2),
            `card overlap ${width}/${uiScale}`,
          );
        }
      }
      const overflow = await page.evaluate(() => {
        const m = document.querySelector('main.main');
        return {
          doc: document.documentElement.scrollWidth,
          width: innerWidth,
          scroll: m.scrollWidth,
          client: m.clientWidth,
          offenders: [...m.querySelectorAll('*')]
            .filter((e) => e.getBoundingClientRect().right > m.getBoundingClientRect().right + 2)
            .slice(0, 5)
            .map((e) => [e.className, e.getBoundingClientRect().right]),
        };
      });
      assert.ok(
        overflow.doc <= overflow.width + 1 && overflow.scroll <= overflow.client + 1,
        `horizontal overflow ${width}/${uiScale}: ${JSON.stringify(overflow)}`,
      );
      if (width === 1920) {
        assert.equal(boxes.length, initial.length);
        boxes.forEach((b, i) => {
          for (const key of ['x', 'y', 'w', 'h'])
            assert.ok(Math.abs(b[key] - initial[i][key]) < 2, `layout did not return: ${key}`);
        });
      }
      views++;
    }
    // Opening and cancelling Customize on a laptop must not overwrite the desktop layout.
    await page.setViewportSize({ width: 1366, height: 1080 });
    await page.waitForTimeout(550);
    await page.evaluate(() => window.testStore.state.dashEditReq++);
    await page.waitForTimeout(250);
    await page.locator('.dbar').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(await snapshot(), before, 'Cancel failed to restore layout');
  }

  // A dense saved layout, a long folded title, and actual pointer resizing at a scaled viewport.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    const { state, DEFAULT_LAYOUT } = window.testStore;
    const layout = [
      { i: 'temps', x: 0, y: 0, w: 3, h: 6 },
      { i: 'toolhead', x: 3, y: 0, w: 6, h: 6 },
      { i: 'limits', x: 9, y: 0, w: 3, h: 6 },
      { i: 'console', x: 0, y: 6, w: 6, h: 5 },
      { i: 'webcam', x: 6, y: 6, w: 3, h: 5 },
      { i: 'system', x: 9, y: 6, w: 3, h: 5 },
    ];
    state.settings = {
      ...state.settings,
      uiScale: 100,
      autoLayout: false,
      layout,
      hiddenCards: DEFAULT_LAYOUT()
        .map((x) => x.i)
        .filter((i) => !layout.some((x) => x.i === i)),
      layoutWidths: { idle: 1500 },
      collapsed: { temps: true },
      cardTitles: { temps: { name: 'Very long temperature card title for a narrow folded card' } },
    };
  });
  await page.waitForTimeout(600);
  const custom = await snapshot();
  for (const width of [1600, 1366, 1100, 390, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(550);
    assert.equal(await snapshot(), custom);
    const fold = page.locator('.cell.collapsed .clp').first();
    assert.ok(
      await fold.evaluate((e) => {
        const b = e.getBoundingClientRect(),
          c = e.closest('.cell').getBoundingClientRect();
        return b.left >= c.left - 1 && b.right <= c.right + 1 && b.top >= c.top - 1 && b.bottom <= c.bottom + 1;
      }),
      'fold control clipped',
    );
    views++;
  }
  await page.setViewportSize({ width: 1366, height: 1080 });
  await page.waitForTimeout(550);
  await page.evaluate(() => window.testStore.state.dashEditReq++);
  await page.waitForTimeout(400);
  const handle = page.locator('.grid .rz.br').first();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const step = await page.locator('.grid').evaluate((e) => e.getBoundingClientRect().width / 12);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + step, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.locator('.dbar').getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(() => window.testStore.state.settings.layout.find((x) => x.i === 'temps').w),
    4,
    'scaled resize did not snap one column',
  );
  assert.deepEqual(errors, []);
  console.log(
    `dashboard resize: ${views} views, layout preservation, overlap, folded headers, scaled pointer resize and Customize cancel passed`,
  );
} finally {
  await browser.close();
  await server.close();
}
