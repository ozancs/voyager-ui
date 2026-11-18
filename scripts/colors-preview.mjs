import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const out = '../_reviews/voyager-seven-prs/';
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
try {
  await p.goto('http://127.0.0.1:5198/');
  await p.waitForFunction(async () => {
    const { state } = await import('/src/store.js');
    return state.settingsLoaded && state.klippy === 'ready';
  });
  await p.evaluate(async () => {
    window.st = await import('/src/store.js');
    st.state.settingsOpen = 'appearance';
    st.state.settings.sound.enabled = false;
  });
  await p.waitForTimeout(2000);
  const before = await p.evaluate(() => st.state.settings.accent);
  await p.getByRole('button', { name: 'Custom accent', exact: true }).click();
  const hex = p.getByRole('textbox', { name: 'Hex', exact: true });
  await hex.fill('#440000');
  await hex.press('Tab');
  assert.equal(await p.getByRole('spinbutton', { name: 'R', exact: true }).inputValue(), '68');
  await p.screenshot({ path: out + '08-colour-spectrum.png' });
  await p.locator('.color-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await p.evaluate(() => st.state.settings.accent), before);
  await p.getByRole('button', { name: 'Custom accent', exact: true }).click();
  await hex.fill('#222222');
  await hex.press('Tab');
  assert.equal(await p.getByRole('spinbutton', { name: 'S', exact: true }).inputValue(), '0');
  await p.screenshot({ path: out + '08-colour-grey.png' });
  await hex.fill('#badhex');
  assert(await p.locator('.color-editor').getByRole('button', { name: 'OK', exact: true }).isDisabled());
  await hex.fill('#0080ff');
  await hex.press('Tab');
  await p.locator('.color-editor').getByRole('button', { name: 'OK', exact: true }).click();
  assert.equal(await p.evaluate(() => st.state.settings.accent), '#0080ff');
  await p.evaluate(() => {
    st.state.settings.accent = '#03b597';
    st.state.settingsOpen = null;
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => (st.state.settingsOpen = 'appearance'));
  await p.getByRole('button', { name: 'Custom accent', exact: true }).click();
  await hex.fill('#ff8000');
  await hex.press('Tab');
  await p.screenshot({ path: out + '08-colour-phone.png' });
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.evaluate(() => {
    st.state.settingsOpen = null;
    st.state.settings = {
      ...st.state.settings,
      autoLayout: false,
      layout: [{ i: 'devices', x: 0, y: 0, w: 12, h: 7 }],
      hiddenCards: st
        .DEFAULT_LAYOUT()
        .map((x) => x.i)
        .filter((x) => x !== 'devices'),
    };
  });
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Color', exact: true }).first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Color', exact: true }).first().click();
  await p.waitForTimeout(500);
  await hex.fill('#ff8000');
  await hex.press('Tab');
  await p.screenshot({ path: out + '08-led-colour.png' });
  const commandsBefore = await p.evaluate(
    () => st.state.console.filter((x) => JSON.stringify(x).includes('SET_LED')).length,
  );
  await p.locator('.color-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    await p.evaluate(() => st.state.console.filter((x) => JSON.stringify(x).includes('SET_LED')).length),
    commandsBefore,
  );
  await p.evaluate(() => (st.state.settingsOpen = 'general'));
  await p.getByText('Print progress', { exact: true }).scrollIntoViewIfNeeded();
  await p.screenshot({ path: out + '09-progress-settings.png' });
  assert.equal(await p.locator('input[type="color"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'Colour editor: RGB/HSL/Hex, invalid input, confirm, cancel, LED cancel, phone layout and screenshots passed',
  );
} finally {
  await b.close();
}
