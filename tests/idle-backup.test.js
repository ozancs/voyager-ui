import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { reactive, nextTick } from 'vue';
const mock = vi.hoisted(() => ({
  state: { settings: {}, klippy: 'ready' },
  objects: {},
  handlers: {},
  gcode: vi.fn(),
  toast: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../src/store', () => ({
  state: mock.state,
  S: (n) => mock.objects[n] || {},
  gcode: mock.gcode,
  toast: mock.toast,
  saveSettings: mock.save,
}));
vi.mock('../src/api/moonraker', () => ({
  api: { on: (n, cb) => (mock.handlers[n] = cb), off: (n) => delete mock.handlers[n] },
}));
vi.mock('../src/i18n', () => ({ t: (s) => s }));
import { backup, runBackup, startBackupWatch } from '../src/backup.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  mock.state.settings = reactive({ backupAuto: true });
  mock.state.klippy = 'ready';
  mock.objects = {
    configfile: { settings: { 'gcode_macro update_git': {} } },
    print_stats: reactive({ state: 'standby' }),
  };
  mock.handlers = {};
  mock.gcode.mockReset();
  mock.gcode.mockResolvedValue({});
  backup.running = false;
  backup.waiting = false;
  backup.waitWhy = '';
  backup.lines = [];
});
describe('backup', () => {
  it('manual during print runs once after', async () => {
    startBackupWatch();
    mock.objects.print_stats.state = 'printing';
    await nextTick();
    await runBackup('manual');
    expect(mock.gcode).not.toHaveBeenCalled();
    mock.objects.print_stats.state = 'complete';
    await nextTick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mock.gcode).toHaveBeenCalledExactlyOnceWith('UPDATE_GIT');
  });
  it('auto off during debounce cancels', async () => {
    startBackupWatch();
    mock.handlers.notify_filelist_changed([{ item: { root: 'config', path: 'printer.cfg' } }]);
    mock.state.settings.backupAuto = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(60000);
    expect(mock.gcode).not.toHaveBeenCalled();
  });
  it('auto off while waiting for print end cancels and frees the button', async () => {
    startBackupWatch();
    mock.objects.print_stats.state = 'printing';
    await nextTick();
    await runBackup('auto');
    expect(backup.waiting).toBe(true);
    mock.state.settings.backupAuto = false;
    await nextTick();
    expect(backup.waiting).toBe(false);
    mock.objects.print_stats.state = 'complete';
    await nextTick();
    await vi.advanceTimersByTimeAsync(6000);
    expect(mock.gcode).not.toHaveBeenCalled();
  });
});
function idleHarness(cfg, extra = {}) {
  const src = readFileSync(new URL('../src/features.js', import.meta.url), 'utf8');
  const part = src.slice(
    src.indexOf('let idleSince ='),
    src.indexOf('// ---------------------------------------------------------------- MCU firmware'),
  );
  const notices = [],
    toasts = [];
  const obj = {
    heaters: { available_heaters: ['extruder', 'heater_bed', 'heater_generic chamber'] },
    extruder: { target: 200 },
    heater_bed: { target: 0 },
    'heater_generic chamber': { target: 60 },
    print_stats: { state: 'standby' },
    toolhead: { extruder: 'extruder' },
    configfile: { settings: { idle_timeout: cfg } },
    ...extra,
  };
  const state = { settings: { idleHeatMin: 20 } };
  const check = Function(
    'state',
    'S',
    'unnotify',
    'closeToast',
    'prettyName',
    't',
    'notify',
    'alertEvent',
    'toast',
    'gcode',
    part + '; return checkIdleHeat;',
  )(
    state,
    (n) => obj[n] || {},
    () => {},
    () => {},
    (n) => n,
    (s) => s,
    (...x) => notices.push(x),
    () => {},
    (msg, kind, opts) => {
      toasts.push({ opts });
      return toasts.length - 1;
    },
    mock.gcode,
  );
  return { check, obj, notices };
}
const run = async (cfg, offAt10 = true) => {
  const h = idleHarness(cfg);
  h.check();
  await vi.advanceTimersByTimeAsync(600000);
  if (offAt10) h.obj.extruder.target = 0;
  h.check();
  await vi.advanceTimersByTimeAsync(1200000);
  h.check();
  return h.notices.length;
};
describe('idle heaters', () => {
  it('partial M104/M140 still warns for chamber', async () =>
    expect(await run({ timeout: 600, gcode: 'M104 S0\nM140 S0' })).toBe(1));
  it('commented TURN_OFF_HEATERS does not count', async () =>
    expect(await run({ timeout: 600, gcode: '# TURN_OFF_HEATERS\nM104 S0' })).toBe(1));
  it('full TURN_OFF_HEATERS stays quiet', async () =>
    expect(await run({ timeout: 600, gcode: 'TURN_OFF_HEATERS' })).toBe(0));
  it('SET_HEATER_TEMPERATURE chamber + M104 covers all', async () =>
    expect(await run({ timeout: 600, gcode: 'M104 S0\nSET_HEATER_TEMPERATURE HEATER=chamber TARGET=0' })).toBe(0));
  it('M104 S200 is not a turn-off', async () =>
    expect(await run({ timeout: 600, gcode: 'M104 S200\nM140 S0' })).toBe(1));
  it('no idle_timeout section uses the default', async () => expect(await run(undefined)).toBe(0));
});
