// Printers page (fleet.js): a saved entry for the page's own machine replaces the page's card, so it shows once
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = String(v)),
    removeItem: (k) => delete store[k],
  });
  vi.stubGlobal('location', { protocol: 'http:', host: '192.168.0.208:1977', hostname: '192.168.0.208' });
  vi.resetModules();
});

const load = async (list, cur) => {
  store['voyager-ui-printers'] = JSON.stringify(list);
  if (cur != null) store['voyager-ui-printer'] = JSON.stringify(cur);
  return (await import('../src/fleet.js')).fleetList();
};

describe('fleetList', () => {
  it("keeps the page's own card when no saved printer is on this machine", async () => {
    const l = await load([{ id: 'a', name: 'VC4', host: '192.168.0.243:1977' }]);
    expect(l.map((p) => p.id)).toEqual(['', 'a']);
    expect(l[0].cur).toBe(true);
  });
  it("drops the page's card when a saved printer is the same machine, on any port", async () => {
    for (const host of ['192.168.0.208', '192.168.0.208:7125', '192.168.0.208:1977']) {
      const l = await load([
        { id: 'a', name: 'VC4', host: '192.168.0.243:1977' },
        { id: 'b', name: 'Salad Fork', host },
      ]);
      expect(l.map((p) => p.id)).toEqual(['a', 'b']);
      // connected through the page itself: the saved entry for this machine is the connected one
      expect(l.find((p) => p.id === 'b').cur).toBe(true);
      expect(l.find((p) => p.id === 'a').cur).toBe(false);
    }
  });
  it('marks the saved entry connected when it was picked', async () => {
    const l = await load([{ id: 'b', name: 'Salad Fork', host: '192.168.0.208' }], 'b');
    expect(l).toHaveLength(1);
    expect(l[0].cur).toBe(true);
  });
});
