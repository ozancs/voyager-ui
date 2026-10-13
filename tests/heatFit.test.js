import { describe, it, expect } from 'vitest';
import { fit } from '../src/heatFit.js';

// samples of an exponential heat-up toward `asym` from `from`, time constant tau, `secs` long, 1 per second
function expo(from, asym, tau, secs, noise = 0) {
  const t = [];
  for (let s = 0; s <= secs; s++)
    t.push(asym - (asym - from) * Math.exp(-s / tau) + (noise ? (Math.random() - 0.5) * noise : 0));
  return t;
}
const time = (from, asym, tau, to) => tau * Math.log((asym - from) / (asym - to));

describe('heat-up estimate', () => {
  it('times an exponential heat-up toward a target below the asymptote', () => {
    // a bed: asymptote 130, tau 300 s, target 110, 120 s in
    const t = expo(25, 130, 300, 120, 0.05);
    const g = t.map(() => 110);
    const r = fit(t, g);
    const truth = time(t[t.length - 1], 130, 300, 109.5);
    expect(r.secs).toBeGreaterThan(truth * 0.8);
    expect(r.secs).toBeLessThan(truth * 1.2);
  });
  it('says when a heater levels off short of its target', () => {
    // a chamber heated by the bed: settles at 47 with a target of 50
    const t = expo(30, 47, 120, 170, 0.03);
    const g = t.map(() => 50);
    const r = fit(t, g);
    expect(r.levels).toBeGreaterThan(45);
    expect(r.levels).toBeLessThan(49);
  });
  it('uses the current rate for a hotend still at full power', () => {
    const t = Array.from({ length: 40 }, (_, s) => 30 + s * 3); // 3 °C/s straight line
    const g = t.map(() => 250);
    const r = fit(t, g);
    expect(r.secs).toBeGreaterThan((250 - 147) / 3 - 4);
    expect(r.secs).toBeLessThan((250 - 147) / 3 + 4);
  });
  it('waits for data after a new target and stops at the target', () => {
    const t = Array.from({ length: 40 }, (_, s) => 30 + s);
    const g = t.map((_, i) => (i < 30 ? 0 : 200));
    expect(fit(t, g)).toEqual({ wait: true });
    expect(fit([200, 200], [200, 200])).toBe(null);
    expect(
      fit(
        t,
        t.map(() => 0),
      ),
    ).toBe(null);
  });
});
