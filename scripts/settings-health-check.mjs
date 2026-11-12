import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const server = await createServer({ mode: 'demo', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=gl'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
async function tab(name) {
  await page.evaluate(async (n) => {
    const { state } = await import('/src/store.js');
    state.settingsOpen = n;
  }, name);
  await page.waitForTimeout(500);
}
try {
  await page.goto(base + '/#/machine');
  await page.waitForTimeout(2500);
  const row = page.locator('.fr').filter({ hasText: 'moonraker.conf' }).first();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'hidden' });
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await tab('appearance');
  const img = page.locator('.printer-icon-controls img');
  assert(await img.evaluate((el) => el.complete && el.naturalWidth > 0));
  const before = await img.boundingBox();
  await page.getByLabel('Printer icon', { exact: true }).selectOption('l:sidebarLogo-btt');
  await page.waitForTimeout(200);
  const after = await img.boundingBox();
  assert.equal(before.height, after.height);
  assert.equal(before.y, after.y);
  await page.screenshot({ path: '../settings-appearance.png' });
  await page.evaluate(() => {
    window.previewOscillators = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.previewOscillators++;
      return original.apply(this, args);
    };
  });
  await tab('sounds');
  assert.equal(await page.locator('.alert-controls select').count(), 5);
  const optionsFor = (name) => page.getByRole('combobox', { name }).evaluate((n) => [...n.options].map((o) => o.value));
  assert(
    !(await optionsFor(/^Error \/ Klipper shutdown/)).includes('soft'),
    'Error sounds must not offer notification bells',
  );
  assert(!(await optionsFor(/^Print finished/)).includes('urgent'), 'Notifications must not offer error alarms');
  assert((await optionsFor(/^Print paused/)).includes('attention'), 'Pauses need attention sounds');
  assert((await optionsFor(/^Filament runout/)).includes('knock'), 'Runout needs its own attention sound choice');

  await page.locator('.alert-controls select').first().selectOption('bright');
  assert.equal(
    await page.evaluate(async () => (await import('/src/store.js')).state.settings.sound.styles.complete),
    'bright',
  );
  assert((await page.evaluate(() => window.previewOscillators)) > 0, 'Selection must autoplay');
  await page.locator('.alert-controls button').first().click();
  await page.screenshot({ path: '../settings-sounds.png' });
  // Isolated config transport: no credentials or writes go to a real printer.
  await page.evaluate(async () => {
    const { api } = await import('/src/api/moonraker.js');
    const original = api.call.bind(api);
    const get = api.getText.bind(api);
    window.fixture = {
      text: '[bot]\nbot_token: test-token\nchat_id: 42\n[telegram_ui]\nbuttons: custom\n',
      writes: [],
    };
    api.call = async (m, p) =>
      m === 'server.files.get_directory'
        ? { files: [{ filename: 'telegram.conf' }], dirs: [] }
        : m === 'server.notifiers.list'
          ? { notifiers: [] }
          : original(m, p);
    api.getText = async (u) => (u.endsWith('/telegram.conf') ? window.fixture.text : get(u));
    api.upload = async (blob, opts) => {
      window.fixture.writes.push({ text: await blob.text(), ...opts });
      return {};
    };
  });
  await tab('notify');
  await page.getByText('Existing bot installation', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Edit connection', exact: true }).click();
  await page.getByLabel('Chat ID', { exact: true }).fill('84');
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await page.waitForTimeout(300);
  const writes = await page.evaluate(() => window.fixture.writes);
  assert(
    writes.some(
      (w) => w.name === 'telegram.conf' && w.text.includes('chat_id: 84') && w.text.includes('buttons: custom'),
    ),
  );
  await page.getByRole('button', { name: 'Add notification', exact: true }).click();
  assert(!(await page.locator('.pre.code').textContent()).includes('undefined'));
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await page.screenshot({ path: '../settings-notifications.png' });
  await page.evaluate(async () => {
    (await import('/src/store.js')).state.settingsOpen = null;
  });
  await page.goto(base + '/#/health');
  await page.waitForTimeout(1800);
  await page.locator('.host-metrics').waitFor();
  const healthRows = await page
    .locator('.hg > section')
    .evaluateAll((nodes) =>
      nodes
        .slice(0, 4)
        .map((n) => ({ id: n.id, top: n.getBoundingClientRect().top, bottom: n.getBoundingClientRect().bottom })),
    );
  assert(Math.abs(healthRows[0].bottom - healthRows[1].bottom) < 2, JSON.stringify(healthRows));
  assert(Math.abs(healthRows[2].bottom - healthRows[3].bottom) < 2, JSON.stringify(healthRows));
  await page.getByRole('button', { name: 'Firmware guidance' }).first().click();
  assert.equal(await page.locator('.firmware-help code').count(), 0);
  assert.equal(await page.locator('.firmware-help a').count(), 2);
  const ring = page.locator('.maintenance-progress').first();
  await ring.waitFor();
  assert((await ring.getAttribute('aria-valuenow')) !== null);
  await page.locator('#h-host').screenshot({ path: '../health-host.png' });
  await page.locator('#h-maint').screenshot({ path: '../health-maintenance.png' });
  await page.screenshot({ path: '../health-refreshed.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // A new page keeps audio discovery independent of earlier cached camera detection.
  const audioPage = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  audioPage.on('pageerror', (e) => errors.push(e.message));
  await audioPage.goto(base + '/#/console');
  await audioPage.waitForTimeout(2200);
  await audioPage.evaluate(async () => {
    const { api } = await import('/src/api/moonraker.js');
    const { state } = await import('/src/store.js');
    const call = api.call.bind(api),
      af = api.fetch.bind(api),
      real = window.fetch.bind(window);
    window.audioFixture = {
      text: 'streams:\n  mic: exec:ffmpeg -f alsa -i default -c:a libopus -f rtsp {output}\n',
      opened: 0,
      closed: 0,
      restarts: 0,
    };
    api.call = async (m, p) =>
      m === 'server.files.get_directory' ? { files: [{ filename: 'go2rtc.yaml' }], dirs: [] } : call(m, p);
    api.fetch = async (u, i) => (String(u).includes('go2rtc.yaml') ? new Response(window.audioFixture.text) : af(u, i));
    api.upload = async (blob, o) => {
      if (o.name === 'go2rtc.yaml') window.audioFixture.text = await blob.text();
      return {};
    };
    window.fetch = async (u, i) =>
      String(u).includes('/api/streams')
        ? new Response(JSON.stringify({ mic: {} }))
        : String(u).includes('/api/webrtc')
          ? new Response('answer')
          : String(u).includes('/api/restart')
            ? (window.audioFixture.restarts++, new Response('ok'))
            : real(u, i);
    window.RTCPeerConnection = class {
      constructor() {
        window.audioFixture.opened++;
        this.iceGatheringState = 'complete';
      }
      addTransceiver(kind, options) {
        if (kind !== 'audio' || options.direction !== 'recvonly') throw Error('Unexpected capture');
      }
      async createOffer() {
        return { type: 'offer', sdp: 'offer' };
      }
      async setLocalDescription(sdp) {
        this.localDescription = sdp;
      }
      async setRemoteDescription() {}
      close() {
        window.audioFixture.closed++;
      }
    };
    state.settingsOpen = 'webcams';
  });
  await audioPage.getByRole('button', { name: 'Listen to camera audio', exact: true }).click();
  await audioPage.waitForTimeout(100);
  await audioPage
    .locator('.rw')
    .filter({ hasText: 'Sound: noise reduction' })
    .getByRole('button', { name: 'Strong', exact: true })
    .click();
  await audioPage.waitForFunction(() => window.audioFixture.opened >= 2);
  assert((await audioPage.evaluate(() => window.audioFixture.text)).includes('afftdn=nr=30'));
  assert.equal(await audioPage.evaluate(() => window.audioFixture.restarts), 1);
  await audioPage.screenshot({ path: '../settings-camera-audio.png' });
  await audioPage.evaluate(async () => {
    (await import('/src/store.js')).state.settingsOpen = null;
  });
  await audioPage.waitForTimeout(100);
  assert.equal(
    await audioPage.evaluate(() => window.audioFixture.opened),
    await audioPage.evaluate(() => window.audioFixture.closed),
  );
  for (const section of ['appearance', 'sounds', 'sync', 'webcams']) {
    await audioPage.setViewportSize({ width: 390, height: 844 });
    await audioPage.evaluate(async (n) => {
      (await import('/src/store.js')).state.settingsOpen = n;
    }, section);
    await audioPage.waitForTimeout(200);
    assert(await audioPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), section);
  }
  await audioPage.close();
  assert.deepEqual(errors, []);
  console.log(
    'Context menu, logo layout, sound selection, bot config preservation, notification preview, firmware guidance, health gauges and phone width passed',
  );
} finally {
  await browser.close();
  await server.close();
}
