import { describe, it, expect } from 'vitest';
import { normalizeHex, hexToHsl, hslHex, hexRgb, rgbHex } from '../src/colorMath';
import { savedPrintMethods, fileRemaining, slicerRemaining, createLayerTracker, layers } from '../src/printMetrics';
describe('shared colour editor conversions', () => {
  it('round-trips primaries, greys and dark colours through HSL', () => {
    for (const hex of ['#440000', '#222222', '#ff8000', '#00ffff', '#ffffff', '#000000', '#123456']) {
      const { h, s, l } = hexToHsl(hex);
      expect(hslHex(h, s, l)).toBe(hex);
      expect(rgbHex(hexRgb(hex))).toBe(hex);
    }
  });
  it('rejects invalid input and expands short hex', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex('#12345x')).toBeNull();
    expect(rgbHex([-10, 300, 0])).toBe('#00ff00');
  });
});
describe('print progress and layer fallback', () => {
  it('keeps the last valid method in each older print calculation setting', () => {
    const settings = { progressCalc: 'relative', estimateCalc: ['slicer', 'file', 'unknown'], etaCalc: ['filament'] };
    const saved = savedPrintMethods(settings);
    expect(saved).toEqual({ progressCalc: 'relative', estimateCalc: ['file'], etaCalc: ['filament'] });
    expect(savedPrintMethods(saved)).toEqual(saved);
    expect(settings.estimateCalc).toEqual(['slicer', 'file', 'unknown']);
  });
  it('accepts scalar backups and writes time methods as single-item arrays for older clients', () => {
    expect(savedPrintMethods({ progressCalc: ['slicer', 'file'], estimateCalc: 'smart', etaCalc: 'file' })).toEqual({
      progressCalc: 'file',
      estimateCalc: ['smart'],
      etaCalc: ['file'],
    });
  });
  it('defaults missing or unsupported methods independently', () => {
    const defaults = { progressCalc: 'slicer', estimateCalc: ['slicer'], etaCalc: ['slicer'] };
    expect(savedPrintMethods({})).toEqual(defaults);
    expect(savedPrintMethods({ progressCalc: 'smart', estimateCalc: [], etaCalc: ['relative'] })).toEqual(defaults);
  });
  it('does not report zero time forever when slicer duration overruns', () => {
    expect(slicerRemaining(3600, 1200, 99)).toBe(2400);
    expect(slicerRemaining(3600, 3700, 99)).toBe(99);
    expect(slicerRemaining(undefined, 50, null)).toBeNull();
    expect(fileRemaining(0.5, 100)).toBe(100);
  });
  it('ignores travel and Z-hop, then accepts extrusion at the next layer', () => {
    const track = createLayerTracker();
    const ps = { filename: 'benchy.gcode', state: 'printing', print_duration: 10 };
    const sample = (x, y, z, e) => track(ps, { gcode_position: [x, y, z, e] });
    expect(sample(0, 0, 0.2, 0)).toBeNull();
    expect(sample(1, 1, 0.2, 1)).toBe(0.2);
    expect(sample(2, 2, 0.8, 1)).toBe(0.2);
    expect(sample(3, 3, 0.8, 0.5)).toBe(0.2);
    expect(sample(3, 3, 0.8, 1)).toBe(0.2);
    expect(sample(4, 4, 0.4, 1)).toBe(0.2);
    expect(sample(5, 5, 0.4, 2)).toBe(0.4);
    expect(layers({}, { layer_height: 0.2, first_layer_height: 0.2, object_height: 10 }, 0.4)).toEqual({
      cur: 2,
      total: 50,
      estimated: true,
      confirmedTotal: 0,
      labels: { cur: '~2', total: '~50' },
    });
  });
  it('prefers reported layers, bounds estimates and resets for a new job', () => {
    expect(layers({ current_layer: 4, total_layer: 20 }, { layer_height: 0.2 }, 9)).toEqual({
      cur: 4,
      total: 20,
      estimated: false,
      confirmedTotal: 20,
      labels: { cur: '4', total: '20' },
    });
    expect(layers({}, { layer_height: 0.2, object_height: 1 }, 10).cur).toBe(5);
    const track = createLayerTracker();
    track({ filename: 'a', state: 'printing', print_duration: 1 }, { gcode_position: [0, 0, 1, 0] });
    track({ filename: 'a', state: 'printing', print_duration: 2 }, { gcode_position: [1, 1, 1, 1] });
    expect(track({ filename: 'b', state: 'printing', print_duration: 0 }, { gcode_position: [0, 0, 0, 0] })).toBeNull();
  });
  it('never limits a reported layer or a scheduled pause using a height estimate', () => {
    const meta = { layer_height: 0.2, object_height: 20 };
    // Before the estimate is exceeded it can be displayed, but cannot be used as the pause limit.
    expect(layers({ current_layer: 90 }, meta)).toMatchObject({
      confirmedTotal: 0,
      labels: { cur: '90', total: '~100' },
    });
    expect(layers({ current_layer: 135 }, meta)).toMatchObject({
      cur: 135,
      total: 0,
      confirmedTotal: 0,
      labels: { cur: '135', total: '--' },
    });
    expect(layers({ current_layer: 135, total_layer: 180 }, meta)).toMatchObject({
      confirmedTotal: 180,
      labels: { cur: '135', total: '180' },
    });
  });
});
