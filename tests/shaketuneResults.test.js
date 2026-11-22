// Shake&Tune results (shaketuneResults.js): the shapers read from what a test prints
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/store', async () => {
  const { reactive } = await import('vue');
  return { state: reactive({ console: [] }) };
});
vi.mock('../src/api/moonraker', () => ({ api: { on: () => {}, call: async () => ({}) } }));
import { parseRun } from '../src/shaketuneResults.js';

describe('parseRun', () => {
  it('reads the shapers of both axes with their damping ratio', () => {
    const { recs, axesMap } = parseRun(
      [
        'Measuring X axis...',
        'X axis frequency profile generation...',
        'Recommended filters:',
        '    -> For performance: MZV @ 52.4 Hz (with a damping ratio of 0.050)',
        '    -> For low vibrations: EI @ 61.8 Hz (with a damping ratio of 0.050)',
        'Y axis frequency profile generation...',
        '    -> Best shaper: MZV @ 41.6 Hz (with a damping ratio of 0.045)',
      ],
      'all',
    );
    expect(recs).toEqual([
      { axis: 'x', kind: 'For performance', type: 'mzv', freq: 52.4, zeta: 0.05 },
      { axis: 'x', kind: 'For low vibrations', type: 'ei', freq: 61.8, zeta: 0.05 },
      { axis: 'y', kind: 'Best shaper', type: 'mzv', freq: 41.6, zeta: 0.045 },
    ]);
    expect(axesMap).toBe(null);
  });
  it('uses the AXIS the test ran with when the lines do not name one', () => {
    expect(parseRun(['-> For performance: ZV @ 70 Hz'], 'y').recs[0].axis).toBe('y');
  });
  it('reads the axes map', () => {
    expect(parseRun(['Detected axes_map: -y,x,z']).axesMap).toBe('-y,x,z');
  });
});
