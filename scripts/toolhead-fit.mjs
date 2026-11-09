// Regression for narrow Toolhead headers, five Z steps, and taller cards gaining scrollbars.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const server = await createServer({ mode: 'demo', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 2287, height: 966 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await p.waitForSelector('.grid .cell');
  await p.waitForTimeout(1000);
  await p.evaluate(async () => {
    window.testStore = await import('/src/store.js');
  });
  let count = 0;
  for (const style of ['circle', 'buttons'])
    for (const editing of [false, true])
      for (const [w, h] of [
        [2, 6],
        [4, 4],
        [4, 5],
        [6, 4],
        [6, 5],
      ]) {
        await p.evaluate(
          ({ style, editing, w, h }) => {
            const { state, DEFAULT_LAYOUT } = window.testStore;
            state.editDash = false;
            state.settings = {
              ...state.settings,
              autoLayout: false,
              layout: [{ i: 'toolhead', x: 0, y: 0, w, h }],
              hiddenCards: DEFAULT_LAYOUT()
                .map((x) => x.i)
                .filter((i) => i !== 'toolhead'),
              collapsed: {},
              toolheadStyle: style,
              layoutWidths: { idle: 1900 },
              control: { ...state.settings.control, stepsZ: [100, 50, 25, 10, 1] },
            };
            if (editing) state.dashEditReq++;
          },
          { style, editing, w, h },
        );
        await p.waitForTimeout(350);
        const fit = await p.locator('.toolhead').evaluate((el) => {
          const host = el.querySelector('.motion-viewport'),
            body = el.querySelector('.body'),
            header = el.querySelector('.card-h');
          const a = host.getBoundingClientRect(),
            b = body.getBoundingClientRect();
          return {
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
            hw: host.scrollWidth,
            hcw: host.clientWidth,
            hh: header.getBoundingClientRect().height,
            body: [b.width, b.height],
            room: [a.width, a.height],
            zoom: body.style.zoom,
            outside: [...body.querySelectorAll('button,input,svg')]
              .filter((x) => {
                const r = x.getBoundingClientRect();
                return (
                  r.width &&
                  (r.right > a.right + 2 || r.bottom > a.bottom + 2 || r.left < a.left - 2 || r.top < a.top - 2)
                );
              })
              .map((x) => x.getAttribute('aria-label') || x.textContent)
              .slice(0, 4),
          };
        });

        assert.ok(
          fit.sw <= fit.cw + 2 && fit.sh <= fit.ch + 2 && fit.outside.length === 0,
          `overflow ${style}/${editing}/${w}/${h}`,
        );
        assert.ok(fit.hh <= 70, 'header consumes too much height');
        if (w >= 4) assert.ok(fit.hh <= 40, 'header wraps despite having enough room');
        if (process.env.TOOLHEAD_SCREENSHOTS && !editing && style === 'buttons' && w === 4 && h === 4) {
          await p.locator('.cell').screenshot({ path: '../toolhead-single-row.png' });
        }
        if (process.env.TOOLHEAD_SCREENSHOTS && editing && style === 'buttons' && w === 4) {
          await p.locator('.cell').screenshot({ path: `../toolhead-fixed-${h}.png` });
        }
        if (editing) {
          await p
            .locator('.tools')
            .getByRole('radio', { name: style === 'circle' ? 'Buttons' : 'Circle', exact: true })
            .click();
          assert.equal(
            await p.evaluate(() => window.testStore.state.settings.toolheadStyle),
            style === 'circle' ? 'buttons' : 'circle',
          );
          await p.locator('.dbar').getByRole('button', { name: 'Cancel', exact: true }).click();
          assert.equal(await p.evaluate(() => window.testStore.state.settings.toolheadStyle), style);
        }
        count++;
      }
  assert.deepEqual(errors, []);
  console.log(`Toolhead: ${count} shapes/styles/edit states passed`);
} finally {
  await browser.close();
  await server.close();
}
