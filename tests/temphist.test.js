import { describe, it, expect, beforeEach, vi } from 'vitest';

// a tiny localStorage for node
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => (mem[k] = String(v)),
  removeItem: (k) => delete mem[k],
};

const { longHist, loadLong, saveLong, sampleLong, backfillLong, oldestLong, STEP } = await import('../src/temphist.js');

describe('long temperature history', () => {
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    loadLong('k');
    vi.useRealTimers();
  });

  it('takes one sample per slot and keeps the time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    expect(sampleLong({ extruder: { temperature: 200.04, target: 200 } })).toBe(true);
    expect(sampleLong({ extruder: { temperature: 201, target: 200 } })).toBe(false); // same slot
    vi.setSystemTime(1_700_000_000_000 + STEP * 1000);
    expect(sampleLong({ extruder: { temperature: 202, target: 0 } })).toBe(true);
    expect(longHist.extruder.t).toEqual([200, 202]);
    expect(longHist.extruder.g).toEqual([200, 0]);
    expect(longHist.extruder.ts[1] - longHist.extruder.ts[0]).toBe(STEP);
    expect(oldestLong()).toBe(longHist.extruder.ts[0]);
  });

  it('survives a save and load, dropping what is older than a day', () => {
    const now = Math.floor(Date.now() / 1000);
    longHist.bed = { ts: [now - 90000, now - 100, now - 50], t: [50, 60, 61], g: [0, 60, 60] };
    saveLong(true);
    loadLong('k');
    expect(longHist.bed.t).toEqual([60, 61]);
    loadLong('other');
    expect(longHist.bed).toBeUndefined();
  });

  it('backfills the gap from the 1-second store without duplicating', () => {
    const now = Math.floor(Date.now() / 1000);
    longHist.bed = { ts: [now - 60], t: [50], g: [0] };
    const temps = Array.from({ length: 120 }, (_, i) => 40 + i / 10);
    backfillLong({ bed: { temperatures: temps, targets: temps.map(() => 60) } });
    const ts = longHist.bed.ts;
    expect(ts[0]).toBe(now - 60);
    expect(ts.every((v, i) => i === 0 || v > ts[i - 1])).toBe(true);
    expect(ts.every((v) => v % STEP === 0 || v === now - 60)).toBe(true);
    expect(ts[ts.length - 1]).toBeGreaterThan(now - STEP - 1);
  });
});
