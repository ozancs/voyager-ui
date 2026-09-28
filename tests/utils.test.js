import { describe, it, expect } from 'vitest';
import { richHtml, hasMarkup } from '../src/richText.js';

describe('console markup', () => {
  it('keeps coloured spans and simple tags', () => {
    expect(richHtml('<b><span style="color:#87CEEB">a</span></b>')).toBe('<b><span style="color:#87CEEB">a</span></b>');
    expect(richHtml('<span style="color:#00ff00;font-weight:bold">T</span><br/>')).toBe(
      '<span style="color:#00ff00;font-weight:bold">T</span><br>',
    );
  });
  it('leaves everything else as text', () => {
    expect(richHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(richHtml('<img src=x onerror=alert(1)>')).not.toContain('<img');
    expect(richHtml('<span style="color:red" onclick="x()">x</span>')).not.toContain('<span style');
    expect(richHtml('<span style="background:url(javascript:alert(1))">x</span>')).not.toContain('<span style');
  });
  it('keeps entities and plain text', () => {
    expect(richHtml('a &amp; b &#9632;')).toBe('a &amp; b &#9632;');
    expect(richHtml('G28 X Y')).toBe('G28 X Y');
    expect(hasMarkup('ok')).toBe(false);
    expect(hasMarkup('<span style="color:#fff">x</span>')).toBe(true);
  });
});

import { expandPaths } from '../src/paths.js';
describe('download folders', () => {
  it('replaces a folder with every file under it, however deep', () => {
    const all = [
      { path: 'printer.cfg' },
      { path: 'mmu/base/mmu.cfg' },
      { path: 'mmu/macros/a.cfg' },
      { path: 'mmu2/x.cfg' },
      { path: 'mmu/top.cfg' },
    ];
    expect(expandPaths([{ path: 'mmu', dir: true }, { path: 'printer.cfg' }], all).sort()).toEqual([
      'mmu/base/mmu.cfg',
      'mmu/macros/a.cfg',
      'mmu/top.cfg',
      'printer.cfg',
    ]);
  });
});

import { counterGrowth } from '../src/calc.js';
describe('mcu counters', () => {
  it('ignores the drop when Klipper restarts', () => {
    const h = [{ re: 100 }, { re: 120 }, { re: 5 }, { re: 15 }];
    expect(counterGrowth(h, 're')).toBe(30);
  });
});

import { pushDown } from '../src/calc.js';
describe('grid resize from the left or top', () => {
  it('pushes overlapped cards below the resized one', () => {
    const l = [
      { i: 'a', x: 0, y: 0, w: 6, h: 4 },
      { i: 'b', x: 6, y: 0, w: 6, h: 4 },
      { i: 'c', x: 6, y: 4, w: 6, h: 2 },
    ];
    l[0].w = 8; // a grew over b
    pushDown(l, 'a');
    expect(l.find((x) => x.i === 'b').y).toBe(4);
    expect(l.find((x) => x.i === 'c').y).toBe(8);
  });
});

import { backupOf, history, summarize } from '../src/cfgHistory.js';
describe('config history', () => {
  const files = [
    'printer.cfg',
    'hw/steppers.cfg',
    'printer-20260101_101010.cfg',
    'backups/hw__steppers-klipperui-20260102_090000.cfg',
    'backups/printer-klipperui-20260103_120000.cfg',
    'backups/moonraker-klipperui-20260104_120000.conf',
    'notes.txt',
  ];
  it('maps backups to their file', () => {
    expect(backupOf('printer-20260101_101010.cfg')).toBe('printer.cfg');
    expect(backupOf('backups/hw__steppers-klipperui-20260102_090000.cfg', files)).toBe('hw/steppers.cfg');
    expect(backupOf('notes.txt', files)).toBe(null);
  });
  it('lists newest first and filters by file', () => {
    const h = history(files);
    expect(h.map((x) => x.file)).toEqual(['moonraker.conf', 'printer.cfg', 'hw/steppers.cfg', 'printer.cfg']);
    expect(history(files, 'printer.cfg').map((x) => x.klipper)).toEqual([false, true]);
  });
  it('summarizes sections and lines', () => {
    const a = '[extruder]\nrotation_distance: 22\n# note\n[fan]\npin: PA1\n';
    const b = '[extruder]\nrotation_distance: 22.6\n[fan]\npin: PA1\n# other note\n[probe]\npin: PB1\n';
    const s = summarize(a, b);
    expect(s.changed).toEqual([
      { name: 'extruder', kind: 'changed' },
      { name: 'probe', kind: 'added' },
    ]);
    expect(s.added).toBeGreaterThan(0);
    expect(summarize(a, a).same).toBe(true);
  });
  it('reads the SAVE_CONFIG block', () => {
    const a = '[printer]\n#*# [probe]\n#*# z_offset = 1.0\n';
    const b = '[printer]\n#*# [probe]\n#*# z_offset = 1.1\n';
    expect(summarize(a, b).changed).toEqual([{ name: 'probe', kind: 'changed' }]);
  });
});

import {
  pathSteps,
  parsePid,
  parseProbes,
  parseAccuracy,
  parseLevel,
  parseScrews,
  parseShaper,
  parseZOffset,
} from '../src/calibPath.js';
describe('interactive calibration', () => {
  it('picks the steps the printer has', () => {
    const commands = Object.fromEntries(
      [
        'PID_CALIBRATE',
        'QUAD_GANTRY_LEVEL',
        'PROBE_ACCURACY',
        'PROBE_CALIBRATE',
        'BED_MESH_CALIBRATE',
        'SHAPER_CALIBRATE',
      ].map((c) => [c, '']),
    );
    const settings = { probe: {}, quad_gantry_level: {}, bed_mesh: {}, resonance_tester: {} };
    const keys = pathSteps({ commands, settings, heaters: ['extruder', 'heater_bed'] }).map((s) => s.key);
    expect(keys).toEqual(['pid_extruder', 'pid_bed', 'level', 'accuracy', 'zoffset', 'mesh', 'shaper']);
    const bare = pathSteps({
      commands: { PID_CALIBRATE: '', Z_ENDSTOP_CALIBRATE: '' },
      settings: {},
      heaters: ['extruder'],
    });
    expect(bare.map((s) => s.key)).toEqual(['pid_extruder', 'zoffset']);
  });
  it('reads the console output', () => {
    expect(parsePid(['// PID parameters: pid_Kp=22.865 pid_Ki=1.292 pid_Kd=101.178'])).toEqual({
      kp: 22.865,
      ki: 1.292,
      kd: 101.178,
    });
    expect(parseProbes(['// probe at 10.000,20.000 is z=1.5', 'x'])).toEqual([{ x: 10, y: 20, z: 1.5 }]);
    expect(
      parseAccuracy([
        '// probe accuracy results: maximum 2.485000, minimum 2.479000, range 0.006000, average 2.482200, median 2.482500, standard deviation 0.001720',
      ]),
    ).toMatchObject({ range: 0.006, standard_deviation: 0.00172 });
    expect(parseLevel(['// Retries: 1/5 Probed points range: 0.031000 tolerance: 0.007500'])).toEqual([
      { retry: 1, max: 5, range: 0.031, tol: 0.0075 },
    ]);
    const sc = parseScrews([
      '// front left (base) : x=20.0, y=20.0, z=2.48125',
      '// front right : x=380.0, y=20.0, z=2.52344 : adjust CW 01:05',
    ]);
    expect(sc[0]).toMatchObject({ name: 'front left', base: true });
    expect(sc[1]).toMatchObject({ dir: 'CW', text: '01:05' });
    expect(sc[1].turns).toBeCloseTo(1.083, 2);
    const sh = parseShaper([
      "// Fitted shaper 'zv' frequency = 47.8 Hz (vibrations = 6.2%, smoothing ~= 0.071)",
      "// To avoid too much smoothing with 'zv', suggested max_accel <= 12800 mm/sec^2",
      "// Fitted shaper 'mzv' frequency = 53.8 Hz (vibrations = 1.1%, smoothing ~= 0.085)",
      "// To avoid too much smoothing with 'mzv', suggested max_accel <= 8300 mm/sec^2",
      '// Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz',
    ]);
    expect(sh.x).toMatchObject({ type: 'mzv', freq: 53.8, maxAccel: 8300 });
    expect(sh.x.fits).toHaveLength(2);
    expect(parseZOffset(['// probe: z_offset: 1.234'])).toEqual({ key: 'z_offset', value: 1.234 });
  });
});

import { includedFiles } from '../src/cfgedit.js';
describe('config includes', () => {
  it('follows [include] like Klipper and skips files it does not load', async () => {
    const texts = {
      'printer.cfg': '[include hw/*.cfg]\n[include macros.cfg]\n[printer]\n',
      'hw/a.cfg': '[stepper_x]\n',
      'hw/b.cfg': '[include ../extra.cfg]\n',
      'macros.cfg': '[gcode_macro X]\n',
      'extra.cfg': '',
      'old/printer_old.cfg': '[stepper_x]\n',
    };
    const order = await includedFiles(Object.keys(texts), async (f) => texts[f]);
    expect(order).toEqual(['printer.cfg', 'hw/a.cfg', 'hw/b.cfg', 'extra.cfg', 'macros.cfg']);
  });
});

import { lastDefinition } from '../src/cfgedit.js';
describe('where an option is defined', () => {
  it('takes the last definition in load order', async () => {
    const texts = {
      'printer.cfg': '[extruder]\nrotation_distance: 22\n[include tuning.cfg]\n',
      'tuning.cfg': '[extruder]\nrotation_distance: 22.6\n',
    };
    const children = {};
    await includedFiles(Object.keys(texts), async (f) => texts[f], texts, children);
    expect(lastDefinition(texts, children, 'extruder', 'rotation_distance')).toEqual({
      key: 'tuning.cfg',
      section: 'tuning.cfg',
    });
    texts['printer.cfg'] +=
      '#*# <---------------------- SAVE_CONFIG ---------------------->\n#*# [extruder]\n#*# rotation_distance = 23\n';
    expect(lastDefinition(texts, children, 'extruder', 'rotation_distance').key).toBe('printer.cfg');
    expect(lastDefinition(texts, children, 'extruder', 'pid_kp')).toEqual({ key: null, section: 'tuning.cfg' });
  });
});
