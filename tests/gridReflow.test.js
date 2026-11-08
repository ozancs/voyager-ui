import { describe, it, expect } from 'vitest';
import { reflow } from '../src/gridReflow';

const L = [
  { i: 'a', x: 0, y: 0, w: 3, h: 8 },
  { i: 'b', x: 3, y: 0, w: 3, h: 8 },
  { i: 'c', x: 6, y: 0, w: 3, h: 5 },
  { i: 'd', x: 9, y: 0, w: 3, h: 10 },
];
const overlap = (l) =>
  l.some((a, i) => l.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));

describe('dashboard reflow', () => {
  it('keeps the layout as it is when the columns are wide enough', () => {
    expect(reflow(L, 136, 115)).toBe(L);
    expect(reflow(L, 120, 115)).toBe(L);
  });
  it('widens narrow cards, keeps the order and never overlaps', () => {
    const r = reflow(L, 90, 115);
    for (const x of r) {
      expect(x.w).toBe(4);
      expect(x.x + x.w).toBeLessThanOrEqual(12);
    }
    expect(overlap(r)).toBe(false);
    const first = r.find((x) => x.i === 'a');
    expect([first.x, first.y]).toEqual([0, 0]);
    expect(r.map((x) => x.h)).toEqual([8, 8, 5, 10]);
  });
  it('a card never gets more than all the columns', () => {
    const r = reflow([{ i: 'w', x: 0, y: 0, w: 10, h: 4 }], 60, 115);
    expect(r[0].w).toBe(12);
  });
});
