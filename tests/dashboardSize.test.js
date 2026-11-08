import { describe, it, expect } from 'vitest';
import { dashboardSize } from '../src/dashboardSize';

describe('dashboard canvas', () => {
  it('keeps logical positions fixed while shrinking uniformly', () => {
    const large = dashboardSize(1600, 1600);
    const laptop = dashboardSize(1100, 1600);
    expect(laptop.width).toBe(large.width);
    expect(laptop.scale).toBe(1100 / 1600);
    expect(laptop.grid).toBe(true);
    expect(dashboardSize(1600, 1600)).toEqual(large);
  });
  it('stacks before controls become too small', () => {
    expect(dashboardSize(700, 1600).grid).toBe(false);
    expect(dashboardSize(390, 1200).grid).toBe(false);
  });
  it('supports old layouts and rejects invalid imported widths', () => {
    for (const width of [undefined, null, 0, -20, Infinity, '1600', 99999]) {
      expect(dashboardSize(1000, width)).toEqual(dashboardSize(1000));
    }
  });
  it('uses extra room without enlarging controls', () => {
    expect(dashboardSize(2000, 1200)).toEqual({ width: 2000, scale: 1, grid: true });
  });
});
