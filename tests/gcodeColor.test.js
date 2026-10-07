import { describe, it, expect } from 'vitest';
import { colorByFeature, colorBySpeed, objectAt } from '../src/gcodeColor.js';
describe('viewer colouring', () => {
  it('feature types become tool changes', () => {
    const r = colorByFeature(
      ';TYPE:Outer wall\nG1 X1 E1\nT1\n;TYPE:Sparse infill\nG1 X2 E1\n;TYPE:Outer wall\nG1 X3 E1',
    );
    expect(r.text.split('\n')).toEqual([
      'T0',
      ';TYPE:Outer wall',
      'G1 X1 E1',
      ';T1',
      'T3',
      ';TYPE:Sparse infill',
      'G1 X2 E1',
      'T0',
      ';TYPE:Outer wall',
      'G1 X3 E1',
    ]);
    expect(r.legend.filter((l) => l.used).map((l) => l.label)).toEqual(['Outer wall', 'Infill']);
  });
  it('speeds are bucketed', () => {
    const r = colorBySpeed('G1 X1 Y1 E1 F1200\nG1 X2 E1\nG1 X3 E1 F6000\nG1 X4 E1 F12000');
    const ts = r.text.split('\n').filter((l) => /^T\d/.test(l));
    expect(ts[0]).toBe('T0');
    expect(ts.length).toBeGreaterThanOrEqual(2);
  });
  it('finds the object under a point', () => {
    const objs = [
      {
        name: 'a',
        polygon: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        center: [5, 5],
      },
      { name: 'b', center: [50, 50] },
    ];
    expect(objectAt(5, 5, objs)).toBe('a');
    expect(objectAt(55, 52, objs)).toBe('b');
    expect(objectAt(100, 100, objs)).toBe(null);
  });
});
